var express = require('express');
var router = express.Router();

// Normal homepage (not prefilled)
router.get('/', (req, res, next) => {
    res.render('index', {
        title: 'BlogBacklog',
        prefillUrl: '',
    });
});

// Prefilling the url box
router.get('/:url', (req, res, next) => {
    res.render('index', { 
        title: 'BlogBacklog',
        prefillUrl: req.params.url,
    });
});

module.exports = router;