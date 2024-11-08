const player = require('../global/player');

module.exports = {
    name: 'skip',
    description: 'Skips the current song',
    async executeMessage(message, args) {
        try {
            if (!message.member.voice.channel) {
                return message.reply('You need to be in a voice channel to skip songs!');
            }

            if (!player.connection || player.connection.joinConfig.channelId !== message.member.voice.channel.id) {
                return message.reply('I\'m not playing in your voice channel!');
            }

            await player.skip();
            await message.channel.send('Skipped the current song.');
        } catch (error) {
            console.error('Error in skip command:', error);
            await message.channel.send('There was an error while trying to skip the song.');
        }
    }
};