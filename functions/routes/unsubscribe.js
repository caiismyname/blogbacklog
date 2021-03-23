const express = require("express");
const admin = require("firebase-admin");

const router = express.Router();
const db = admin.firestore();

async function unsubscribeFunc(id) {
    analytics.logEvent("Unsubscribed");
    const userData = {
        recipientEmail: "",
        remainingCount: 0,
        sourceUrl: "",
    };

    const doc = await db.collection("feeds").doc(id).get();
    if (doc.exists) {
        userData.recipientEmail = doc.data().recipientEmail;
        userData.remainingCount = doc.data().entries.length;
        userData.sourceUrl = doc.data().baseUrl;
    }

    const res = await db.collection("feeds").doc(id).delete();

    if (res) {
        // TODO error handling
    }

    return (userData);
}

router.get("/:id", async (req, res) => {
    unsubscribeFunc(req.params.id).then((userData) => {
        res.render("unsubscribe",
            {
                title: "Blog Backlog",
                data: userData,
            });
    });
});

exports.unsubscribeRouter = router;
