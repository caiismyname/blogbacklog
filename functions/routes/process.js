const express = require("express");
const functions = require("firebase-functions");
const firebaseAdmin = require("firebase-admin");
const axios = require("axios");
const mailgun = require("mailgun-js");
const { processFunc, extractBaseTitle } = require("./linkExtractor");

const router = express.Router();
const db = firebaseAdmin.firestore();

const DELIVERY_METHODS = {
    POCKET: "POCKET",
    EMAIL: "EMAIL",
};

function splitManualInputLinks(input) {
    const spaceStripped = input.replace(" ", "");
    const separated = spaceStripped.split(",");
    const emptiesRemoved = separated.filter((x) => x.length > 0);

    return (emptiesRemoved);
}

function combineLinks(links, manualLinks) {
    let manualInputedLinks = splitManualInputLinks(manualLinks);

    manualInputedLinks = manualInputedLinks.map((link) => ({
        title: link, // Reuse URL for now, just to keep the field filled. TODO fix
        url: link,
    }));

    const allLinks = links
        .map((entry) => JSON.parse(entry)) // The object gets converted to a string when sent through the HTML form
        .concat(manualInputedLinks);

    return (allLinks);
}

function sendWelcomeEmail(links, info, id) {
    const mg = mailgun({
        apiKey: functions.config().mailgun.key,
        domain: functions.config().mailgun.domain,
    });

    // Prepare data for sending the welcome email
    const cleanedTitle = extractBaseTitle(info.baseUrl);
    const cleanedLinks = links
        .map((link) => link.url)
        .reduce((accum, link) => `${accum}- ${link}\n`, "");
    const data = {
        from: "Blog Backlog <send@mail.blogbacklog.com>",
        to: info.recipientEmail,
        subject: "Welcome to BlogBacklog",
        text: `${"Thank you for using BlogBacklog!\n\n"
            + "You'll receive the following links from "}${cleanedTitle
        }. A link will be sent every ${info.frequency} day(s).\n\n${
            cleanedLinks
        }\n\n\n\n\nUnsubscribe link: blogbacklog.com/unsubscribe/${id}`,
    };

    mg.messages().send(data, (error, body) => {
        if (body) {
            console.log(body);
        }
        if (error) {
            console.log(error);
        }
    });
}

async function addToFirebase(data) {
    const feedsRef = db.collection("feeds");

    console.log(data);

    const fbAdd = feedsRef.add({
        entries: data.allLinks,
        schedule: {
            frequency: Number(data.frequency),
            lastSent: null,
        },
        deliveryMethod: data.deliveryMethod,
        deliveryDetails: data.deliveryDetails,
        baseUrl: data.baseUrl,
        sourceTitle: extractBaseTitle(data.baseUrl),
        isActive: true,
    });

    return fbAdd;
}

// TODO this is a temp fix, should be a UUID-keyed map
let tempStoreUserAccessToken;
const task = {};
let secondRes;

// The following technique to handle async tokens and callback URLs comes from https://stackoverflow.com/questions/50724912/how-to-wait-for-a-url-callback-before-send-http-response-in-koa
async function connectToPocket() {
    const initialPocketRequest = axios.post(
        functions.config().pocket.request_token_url,
        {
            consumer_key: functions.config().pocket.consumer_key,
            redirect_uri: functions.config().pocket.redirect_uri,
        },
        {
            responseType: "json",
            headers: {
                "Content-Type": "application/json; charset=UTF-8",
                "X-Accept": "application/json",
            },
        },
    );

    // Returns a Promise (axios.post is a Promise) that will resolve with a data object that contains the one-time access code.
    return initialPocketRequest;
}

async function pocketRedirect(res) {
    const pocketUserData = new Promise((resolve, reject) => {
        res.redirect(`https://getpocket.com/auth/authorize?request_token=${tempStoreUserAccessToken}&redirect_uri=${functions.config().pocket.redirect_uri}`);

        task.onComplete = (foo) => {
            resolve(foo);
        };

        task.onError = () => {
            reject();
        };
    });

    return pocketUserData;
}

// Routes

router.post("/createFeed", async (req, res) => {
    const allLinks = combineLinks(req.body.links, req.body.manualLinks);
    const fbData = {
        allLinks,
        frequency: req.body.frequency,
        baseUrl: req.body.baseUrl,
        deliveryMethod: req.body.deliveryMethod,
    };

    let preFbPromise;

    if (req.body.deliveryMethod === DELIVERY_METHODS.POCKET) {
        preFbPromise = connectToPocket().then((pocketRes) => {
            // Save the User Access Token for use in future access
            tempStoreUserAccessToken = pocketRes.data.code;

            return pocketRedirect(res);
        }).then((pocketData) => {
            fbData.deliveryDetails = { ...pocketData };
        });
    } else if (req.body.deliveryMethod === DELIVERY_METHODS.EMAIL) {
        secondRes = res;
        preFbPromise = new Promise((resolve) => {
            fbData.deliveryDetails = {
                recipientEmail: req.body.recipientEmail,
            };
            resolve();
        });
    }

    preFbPromise.then(() => addToFirebase(fbData)).then((fbRes) => {
        if (req.body.deliveryMethod === DELIVERY_METHODS.EMAIL) {
            sendWelcomeEmail(allLinks, req.body, fbRes.id);
        }

        secondRes.render("complete",
            {
                title: "BlogBacklog",
                data: {
                    numLinks: allLinks.length,
                    deliveryMethod: fbData.deliveryMethod,
                    deliveryDetails: fbData.deliveryMethod === DELIVERY_METHODS.EMAIL ? fbData.deliveryDetails : {},
                    frequency: fbData.frequency,
                    baseUrl: fbData.baseUrl,
                },
            });
    }).catch((error) => {
        console.error(error);
    });
});

router.post("/parse", async (req, res) => {
    let url = req.body.baseUrl.trim();

    // Forcing `https`
    if (!url.includes("http")) {
        url = `https://${url}`;
    } else if (!url.includes("https")) {
        const restOfUrl = url.slice(url.indexOf("://") + 3);
        url = `https://${restOfUrl}`;
    }

    console.log(url);
    processFunc(url, (cleanedLinks) => {
        res.render("saveChanges",
            {
                title: "BlogBacklog",
                data: {
                    links: cleanedLinks,
                    baseUrl: url,
                },
            });
    });
});

router.get("/pocketAuthFinished", async (req, res) => {
    axios.post(
        functions.config().pocket.request_user_token_url,
        {
            consumer_key: functions.config().pocket.consumer_key,
            code: tempStoreUserAccessToken,
        },
        {
            responseType: "json",
            headers: {
                "Content-Type": "application/json; charset=UTF-8",
                "X-Accept": "application/json",
            },
        },
    )
        .then((response) => {
            const pocketAccessToken = response.data.access_token;
            const pocketUsername = response.data.username;

            secondRes = res;

            // Looks up the originating request that was waiting on the username/token and calls the onComplete function to pass through the data. That function will resolve the Promise with the data.
            task.onComplete({
                username: pocketUsername,
                accessToken: pocketAccessToken,
            });
        })
        .catch((error) => {
            task.onError(error);
        });
});

exports.processRouter = router;
