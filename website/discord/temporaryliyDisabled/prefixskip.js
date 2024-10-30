const player = require('../global/player');

module.exports = {
    name: 'skip',
    description: 'Skip the currently playing song.',
    async executeMessage(message, args) {
        if (!message.member.voice.channel) {
            return message.reply('You need to be in a voice channel to skip a song!');
        }

        player.skip();
        return message.reply('Skipped the current song!');
    },
};