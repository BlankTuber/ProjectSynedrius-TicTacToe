function isNearReset() {
    const now = new Date();
    const resetTime = new Date(now);
    resetTime.setHours(3, 30, 0, 0);
    if (now > resetTime) {
        resetTime.setDate(resetTime.getDate() + 1);
    }
    const timeUntilReset = resetTime - now;
    return timeUntilReset <= 10 * 60 * 1000; // 10 minutes in milliseconds
}

function getResetMessage() {
    const now = new Date();
    const resetTime = new Date(now);
    resetTime.setHours(3, 30, 0, 0);
    if (now > resetTime) {
        resetTime.setDate(resetTime.getDate() + 1);
    }
    const minutesUntilReset = Math.ceil((resetTime - now) / (60 * 1000));
    return `The bot will reset in ${minutesUntilReset} minute${minutesUntilReset !== 1 ? 's' : ''}.`;
}

module.exports = { isNearReset, getResetMessage };