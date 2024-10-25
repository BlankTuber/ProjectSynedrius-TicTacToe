const express = require('express');
const router = express.Router();

router.get("/", (req, res) => {
    res.render("index");
});

router.get("/discord", (req, res) => {
    const error = req.query.error;  // Retrieve error from query if present
    res.render("login", { error });
});

router.post("/discord", (req, res) => {
    const { code } = req.body;
    if (code === process.env.ACCESS_CODE) {
        res.render("discord");
    } else {
        // Pass error as a query parameter in the redirect
        res.redirect("/discord?error=Not authorized");
    }
});

module.exports = router;