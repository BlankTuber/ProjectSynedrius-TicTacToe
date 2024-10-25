const express = require('express');
const router = express.Router();

router.post('/api/changeMe', (req, res) => {
    res.json({ message: 'Changed!' });
});

module.exports = router;