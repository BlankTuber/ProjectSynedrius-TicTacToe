const { isNearReset, getResetMessage } = require('../utils/isNearReset');

module.exports = {
    init: async (client) => {
        client.on('interactionCreate', async interaction => {
            if (!interaction.isChatInputCommand()) return;
            
            if (isNearReset()) {
                return interaction.reply({ content: getResetMessage(), ephemeral: true });
            }

            const command = client.slashCommands.get(interaction.commandName);
            if (!command) return;
            
            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
                await interaction.reply({ 
                    content: 'There was an error executing this command!', 
                    ephemeral: true 
                });
            }
        });
    }
};