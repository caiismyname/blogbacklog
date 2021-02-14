const express = require("express");
const firebaseAdmin = require("firebase-admin");
const functions = require("firebase-functions");
const mailgun = require("mailgun-js");
const { processFunc, extractBaseTitle } = require("./linkExtractor");

const router = express.Router();

firebaseAdmin.initializeApp({
    credential: firebaseAdmin.credential.applicationDefault(),
});
const db = firebaseAdmin.firestore();

function splitManualInputLinks(input) {
    const spaceStripped = input.replace(" ", "");
    const separated = spaceStripped.split(",");
    const emptiesRemoved = separated.filter((x) => x.length > 0);

    return (emptiesRemoved);
}

function sendWelcomeEmail(links, info, id) {
    const mg = mailgun({
        apiKey: functions.config().mailgun.key,
        domain: functions.config().mailgun.domain,
    });

    // Prepare data for sending the welcome email
    const cleanedTitle = extractBaseTitle(info.baseUrl);
    const cleanedLinks = links.reduce((accum, link) => `${accum}- ${link}\n`, "");
    const data = {
        from: "Blog Backlog <send@mail.blogbacklog.com>",
        to: info.recipientEmail,
        subject: "Welcome to BlogBacklog",
        text: `${"Thank you for using BlogBacklog!\n\n"
            + "You'll receive the following links from "}${cleanedTitle
        }. A link will be sent every ${info.frequency} day(s).\n\n${
            cleanedLinks
        }\n\nUnsubscribe link: blogbacklog.com/unsubscribe/${id}`,
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

// Routes

// // Empty endpoint for now, intended to host a "view/edit" feature.
// router.get('/feed', (req, res, next) => {
// });

router.post("/createFeed", async (req, res) => {
    const feedsRef = db.collection("feeds");
    const cleanedTitle = extractBaseTitle(req.body.baseUrl);

    const manualInputedLinks = splitManualInputLinks(req.body.manualLinks);
    const allLinks = req.body.links.concat(manualInputedLinks);

    await feedsRef.add({
        entries: allLinks,
        schedule: {
            frequency: Number(req.body.frequency),
            lastSent: null,
        },
        recipientEmail: req.body.recipientEmail,
        baseUrl: req.body.baseUrl,
        sourceTitle: cleanedTitle,
        isActive: true,
    }).then((fbRes) => {
        sendWelcomeEmail(allLinks, req.body, fbRes.id);
        res.render("complete",
            {
                title: "Blog Backlog",
                data: {
                    numLinks: req.body.links.length,
                    recipientEmail: req.body.recipientEmail.trim(),
                    frequency: req.body.frequency,
                    baseUrl: req.body.baseUrl,
                },
            });
    });
});

router.post("/parse", async (req, res) => {
    let url = req.body.baseUrl.trim();
    if (!url.includes("http")) {
        url = `http://${url}`;
    }
    processFunc(url, (cleanedLinks) => {
        res.render("saveChanges",
            {
                title: "Blog Backlog",
                data: {
                    links: cleanedLinks,
                    baseUrl: url,
                },
            });
    });
});

exports.processRouter = router;