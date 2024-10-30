const fs = require('fs');
const path = require('path');

function updateConfig(key, value) {
    const configPath = path.join(__dirname, '../config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config[key] = value;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

module.exports = updateConfig;