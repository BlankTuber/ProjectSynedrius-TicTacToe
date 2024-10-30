const player = require('../global/player');

module.exports = {
    name: 'play',
    description: 'Play a song from a URL',
    async executeMessage(message, args) {
        const url = args[0];
        if (!url) {
            return message.reply('Please provide a URL to play.');
        }

        if (!message.member.voice.channel) {
            return message.reply('You need to be in a voice channel to play a song!');
        }

        const channel = message.member.voice.channel;
        
        if (!player.connection || player.connection.joinConfig.channelId !== channel.id) {
            player.join(channel);
        }

        await player.play(url);
        return message.reply(`Added to queue: **${url}**`);
    },
};