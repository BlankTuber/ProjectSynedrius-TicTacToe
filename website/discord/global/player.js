const {
    AudioPlayer,
    AudioPlayerStatus,
    createAudioPlayer,
    createAudioResource,
    VoiceConnection,
    VoiceConnectionStatus,
    joinVoiceChannel,
} = require('@discordjs/voice');
const { exec } = require('child_process');
const fs = require('fs');

class Player {
    constructor() {
    this.player = createAudioPlayer();
    this.queue = [];
    this.connection = null;
    this.outputFiles = ['./ytdlp-audio/output1.mp3', './ytdlp-audio/output2.mp3'];
    this.currentOutputIndex = 0;
    this.downloadingNextSong = false;

    this.player.on(AudioPlayerStatus.Playing, () => {
        console.log('Audio is now playing!');
        this.downloadNextSong();
    });

    this.player.on(AudioPlayerStatus.Idle, () => {
        console.log('Audio has finished playing!');
        this.playNext();
    });
    }

    join(channel) {
    this.connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
    });

    this.connection.on(VoiceConnectionStatus.Ready, () => {
        console.log('The bot has connected to the channel!');
        this.connection.subscribe(this.player);
    });

    this.connection.on(VoiceConnectionStatus.Disconnected, () => {
        console.log('Disconnected from the channel!');
        this.connection.destroy();
    });
    }

    async play(url) {
    this.queue.push(url);

    if (this.player.state.status === AudioPlayerStatus.Idle) {
        await this.playNext();
    } else if (!this.downloadingNextSong) {
        this.downloadNextSong();
    }
    }

    async playNext() {
    if (this.queue.length > 0) {
        const nextUrl = this.queue.shift();
        try {
        const resource = await this.createAudioResource(nextUrl);
        this.player.play(resource);
        } catch (err) {
        console.error('Error playing next song:', err);
        // If there's an error playing the next song, skip to the next one
        this.playNext();
        }
    } else {
        console.log('Queue is empty, nothing to play.');
    }
    }

    async downloadNextSong() {
    if (!this.downloadingNextSong && this.queue.length > 0) {
        this.downloadingNextSong = true;
        try {
        // Check if the next song has already been downloaded
        const nextSongPath = this.outputFiles[(this.currentOutputIndex + 1) % this.outputFiles.length];
        // Always download the next song, even if it's already been downloaded
        await this.createAudioResource(this.queue[0]);
        console.log('Downloaded next song in the queue.');
        } catch (err) {
        console.error('Error downloading next song:', err);
        } finally {
        this.downloadingNextSong = false;
        }
    }
    }

    async createAudioResource(url) {
    return new Promise((resolve, reject) => {
        const outputFilePath = this.outputFiles[this.currentOutputIndex];
        const nextOutputIndex = (this.currentOutputIndex + 1) % this.outputFiles.length;

        // Delete the previous output file if it exists
        if (fs.existsSync(outputFilePath)) {
        fs.unlinkSync(outputFilePath);
        }

        console.log(`Starting download for: ${url}`);
        const command = `yt-dlp -f bestaudio -o "${outputFilePath}" "${url}"`;
        const ytDlpProcess = exec(command);

        const MAX_SONG_DURATION = 1200; // 20 minutes in seconds

        ytDlpProcess.on('exit', async (code) => {
        if (code === 0) {
            // Check the song duration
            try {
            const fileInfo = await fs.promises.stat(outputFilePath);
            const songDuration = Math.floor(fileInfo.size / 128000); // Assuming 128 kbps audio bitrate
            if (songDuration > MAX_SONG_DURATION) {
                console.error(`Song exceeds ${MAX_SONG_DURATION} second limit: ${songDuration} seconds`);
                fs.unlinkSync(outputFilePath); // Delete the file
                reject(`Song exceeds ${MAX_SONG_DURATION} second limit: ${songDuration} seconds`);
                return;
            }
            } catch (err) {
            console.error('Error checking song duration:', err);
            // If we can't get the duration, proceed with the download
            }

            console.log(`Downloaded: ${outputFilePath}`);
            const audioResource = createAudioResource(outputFilePath);
            this.currentOutputIndex = nextOutputIndex;
            resolve(audioResource);
        } else {
            console.error(`Download failed with code: ${code}`);
            reject(`yt-dlp exited with code: ${code}`);
        }
        });

        ytDlpProcess.stderr.on('data', (data) => {
        console.error(`yt-dlp stderr: ${data}`);
        });

        ytDlpProcess.on('error', (error) => {
        console.error(`Error executing command: ${error.message}`);
        reject(`Error executing command: ${error.message}`);
        });
    });
    }

    skip() {
    this.player.stop();
    }

    getQueue() {
    return this.queue;
    }
}

module.exports = new Player();