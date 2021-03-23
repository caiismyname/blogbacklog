const express = require("express");
const firebaseAdmin = require("firebase-admin");

const router = express.Router();

firebaseAdmin.initializeApp({
    credential: firebaseAdmin.credential.applicationDefault(),
});

// Normal homepage (not prefilled)
router.get("/", (req, res) => {
    res.render("index", {
        title: "BlogBacklog",
        prefillUrl: "",
    });
});

// Prefilling the url box
router.get("/:url", (req, res) => {
    res.render("index", {
        title: "BlogBacklog",
        prefillUrl: req.params.url,
    });
});

module.exports = router;
