const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete')
        .setDescription('Deletes a specified number of messages')
        .addIntegerOption((option) =>
        option
            .setName('amount')
            .setDescription('The number of messages to delete')
            .setMinValue(1)
            .setMaxValue(100)
            .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const amount = interaction.options.getInteger('amount');

        // Defer the reply immediately
        await interaction.deferReply({ ephemeral: true });

        try {
            let totalDeleted = 0;

            // Fetch messages first
            const messages = await interaction.channel.messages.fetch({ limit: amount });

            if (messages.size === 0) {
                await interaction.editReply('There are no messages to delete.');
                return;
            }

            // Attempt to bulk delete messages
            const bulkDeleted = await interaction.channel.bulkDelete(messages, true);
            totalDeleted += bulkDeleted.size;

            // If there are remaining messages that couldn't be bulk deleted, delete them individually
            const remainingMessages = messages.filter(msg => !bulkDeleted.has(msg.id));
            for (const msg of remainingMessages.values()) {
                try {
                    await msg.delete();
                    totalDeleted++;
                } catch (error) {
                    console.error('Error deleting individual message:', error);
                }
            }

            await interaction.editReply(`Successfully deleted ${totalDeleted} message(s).`);
        } catch (error) {
            console.error('Error deleting messages:', error);
            await interaction.editReply('There was an error while deleting messages. Some messages may be too old to delete.');
        }
    },
};