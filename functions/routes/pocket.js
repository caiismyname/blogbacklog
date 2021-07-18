// THIS FILE IS NOT IN USE, BUT SERVES AS THE REFERENCE CODE FOR THE POCKET INTEGRATION

const express = require("express");

const router = express.Router();
const axios = require("axios");
const functions = require("firebase-functions");

let tempStoreUserAccessToken;

router.post("/connectToPocket", async (req1, res1) => {
    axios.post(
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
    )
        .then((res) => {
            // Save the User Access Token for use in future access
            tempStoreUserAccessToken = res.data.code;
            return (res1.redirect(`https://getpocket.com/auth/authorize?request_token=${tempStoreUserAccessToken}&redirect_uri=${functions.config().pocket.redirect_uri}`));
        })
        .catch((error) => {
            console.log(error);
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

            console.log(pocketAccessToken);
            console.log(pocketUsername);

            res.render(
                "pocketDone",
                {
                    title: "Pocket COnnecting",
                    data: {
                        message: "connecting",
                    },
                },
            );
        })
        .catch((error) => {
            console.log(error);
        });
});

exports.pocketRouter = router;
