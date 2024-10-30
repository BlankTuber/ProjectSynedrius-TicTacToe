const player = require('../global/player');
const { exec } = require('child_process');

module.exports = {
    name: 'search',
    description: 'Search for a song on YouTube Music and add it to the queue.',
    async executeMessage(message, args) {
        const query = args.join(' ');
        if (!query) {
            return message.reply('Please provide a search query.');
        }

        const command = `yt-dlp -j "ytsearch:${query}"`;

        exec(command, async (error, stdout, stderr) => {
            // ... (use the same search logic as in the slash command)
        });
    },
};