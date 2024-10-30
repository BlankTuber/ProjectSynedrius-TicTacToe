const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'delete',
    description: 'Deletes a specified number of messages',
    async executeMessage(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('You need Administrator permissions to use this command.');
        }

        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) {
            return message.reply('Please provide a number between 1 and 100.');
        }

        try {
            // ... (use the same deletion logic as in the slash command)
            await message.channel.send(`Deleted ${amount} messages.`);
        } catch (error) {
            console.error('Error deleting messages:', error);
            await message.channel.send('There was an error deleting the messages.');
        }
    },
};