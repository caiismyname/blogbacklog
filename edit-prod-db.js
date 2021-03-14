// Warning, be careful.

const firebaseAdmin = require("firebase-admin");
const fbConfig = require('./functions/keys/firebase-service-account.json');

firebaseAdmin.initializeApp({credential: firebaseAdmin.credential.cert(fbConfig)});

const db = firebaseAdmin.firestore();
const feedsRef = db.collection("feeds");

async function run() {
    feedsRef.where("isActive", "==", true)
        .get()
        .then((querySnapshot) => {
            querySnapshot.forEach((doc) => {
                // doc.data() is never undefined for query doc snapshots

                // console.log(doc.id, " => ", doc.data());
                const newEntries = doc.data().entries.map(url => {
                    return ({"title": url, "url": url});
                });

                // Note that you have to re-get the doc in order to run updates on it.
                feedsRef.doc(doc.id).update({
                    entries: newEntries
                }).then(() => {
                    console.log(doc.id, " updated");
                });
            });
        })
        .catch((error) => {
            console.log("Error getting documents: ", error);
        });
}

run();