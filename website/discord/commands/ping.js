const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!'),
        
    async execute(interaction) {
        // You can also show the bot's latency:
        const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        
        await interaction.editReply(`Pong! 🏓\nLatency: ${latency}ms\nAPI Latency: ${interaction.client.ws.ping}ms`);
    },
};