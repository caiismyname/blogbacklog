 const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cors = require('cors');
const PORT = 4000;
const admin = require('firebase-admin');
const serviceAccount = require('//Users/davidcai/Desktop/blogbacklog-cb6c3df2e9a2.json'); //TODO temp path
const router = express.Router();

// App + Router initialization

app.use(cors());
app.use(bodyParser.json());
app.use("/", router);

app.listen(PORT, function() {
    console.log("Server is running on Port: " + PORT);
});

// Firebase Initialization

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Initialization Complete
// Router below

router.get('/feed', (req, res, next) => {

});

router.post('/newFeed', async (req, res, next) => {
    const feedsRef = db.collection('feeds');

    await feedsRef.add({
      entries: ["foo", "bar", "baz"],
      schedule: {
        dayOfWeek: 7,
        frequency: 1,
        lastSent: null,
      },
      isActive: true
    }).then(
        res.json('Feed added')
    );
});

module.exports = router;