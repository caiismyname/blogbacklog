var express = require('express');
var router = express.Router();

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