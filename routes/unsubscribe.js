const express = require('express');
const router = express.Router();

// Firebase Initialization
const admin = require('firebase-admin');

const db = admin.firestore();

async function unsubscribeFunc(id) {
    var userData = {
        recipientEmail: "",
        remainingCount: 0,
        sourceUrl: "",
    };

    const doc = await db.collection('feeds').doc(id).get();
    if (doc.exists) {
        userData.recipientEmail = doc.data().recipientEmail;
        userData.remainingCount = doc.data().entries.length;
        userData.sourceUrl = doc.data().baseUrl;
    }

    const res = await db.collection('feeds').doc(id).delete();

    return(userData);
}

router.get('/:id', async (req, res, next) => {
    unsubscribeFunc(req.params.id).then((userData) => {
        res.render('unsubscribe', 
            { 
                title: 'Blog Backlog',
                data: userData
            }
        );
    });
});

exports.unsubscribeRouter = router;