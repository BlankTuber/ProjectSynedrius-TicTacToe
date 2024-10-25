const express = require('express');
const router = express.router();

router.post('/api/changeMe', (req, res) => {
    res.json({ message: 'Changed!' });
});

module.exports = router;