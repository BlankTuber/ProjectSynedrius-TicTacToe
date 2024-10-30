const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const slashCommandHandler = require('./slashCommandHandler');
const prefixCommandHandler = require('./prefixCommandHandler');

module.exports = {
    init: async (client) => {
        client.slashCommands = new Map();
        client.prefixCommands = new Map();
        const slashCommandsForRegistration = [];

        // Load slash commands
        const slashCommandsPath = path.join(__dirname, '../slashCommands');
        const slashCommandFiles = fs.readdirSync(slashCommandsPath).filter(file => file.endsWith('.js'));

        for (const file of slashCommandFiles) {
            const command = require(`../slashCommands/${file}`);
            if ('data' in command && 'execute' in command) {
                client.slashCommands.set(command.data.name, command);
                slashCommandsForRegistration.push(command.data.toJSON());
                console.log(`Loaded slash command: ${command.data.name}`);
            }
        }

        // Load prefix commands
        const prefixCommandsPath = path.join(__dirname, '../prefixCommands');
        const prefixCommandFiles = fs.readdirSync(prefixCommandsPath).filter(file => file.endsWith('.js'));

        for (const file of prefixCommandFiles) {
            const command = require(`../prefixCommands/${file}`);
            if ('name' in command && 'executeMessage' in command) {
                client.prefixCommands.set(command.name, command);
                console.log(`Loaded prefix command: ${command.name}`);
            }
        }

        // Register slash commands with Discord
        const rest = new REST().setToken(process.env.BOT_TOKEN);
        
        try {
            console.log('Started refreshing slash commands...');
            
            await rest.put(
                Routes.applicationCommands(process.env.APPLICATION_ID),
                { body: slashCommandsForRegistration },
            );
            
            console.log('Successfully registered slash commands!');
        } catch (error) {
            console.error('Error registering slash commands:', error);
        }

        // Initialize slash command handler
        await slashCommandHandler.init(client);

        // Initialize prefix command handler
        prefixCommandHandler.init(client);
    }
};