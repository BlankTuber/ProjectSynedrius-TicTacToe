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
const fs = require('fs').promises;
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);

class Player {
    constructor() {
        this.player = createAudioPlayer();
        this.queue = [];
        this.connection = null;
        this.outputDir = './ytdlp-audio';
        this.outputFiles = ['output1.mp3', 'output2.mp3'].map(file => path.join(this.outputDir, file));
        this.currentOutputIndex = 0;
        this.isDownloading = false;
        this.isPlaying = false;
        this.MAX_SONG_DURATION = 1200; // 20 minutes in seconds

        this.player.on(AudioPlayerStatus.Playing, () => {
            console.log('Audio is now playing!');
            this.isPlaying = true;
            this.tryDownloadNext();
        });

        this.player.on(AudioPlayerStatus.Idle, () => {
            console.log('Audio has finished playing!');
            this.isPlaying = false;
            this.playNext();
        });

        // Ensure output directory exists
        fs.mkdir(this.outputDir, { recursive: true }).catch(console.error);
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

        this.connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
            try {
                await Promise.race([
                    entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
                // Seems to be reconnecting to a new channel - ignore disconnect
            } catch (error) {
                // Seems to be a real disconnect which SHOULDN'T be recovered from
                this.connection.destroy();
            }
        });
    }

    async play(url) {
        const videoInfo = await this.getVideoInfo(url);
        if (!videoInfo) {
            console.error('Failed to get video info');
            return;
        }

        if (videoInfo.duration > this.MAX_SONG_DURATION) {
            console.error(`Song exceeds ${this.MAX_SONG_DURATION} second limit: ${videoInfo.duration} seconds`);
            return;
        }

        this.queue.push({ url, info: videoInfo });

        if (!this.isPlaying && !this.isDownloading) {
            await this.downloadAndPlay();
        } else if (!this.isDownloading && this.queue.length === 2) {
            await this.downloadNext();
        }
    }

    async getVideoInfo(url) {
        try {
            const { stdout } = await execPromise(`yt-dlp -J "${url}"`);
            const info = JSON.parse(stdout);
            return {
                title: info.title,
                duration: info.duration,
                thumbnail: info.thumbnail
            };
        } catch (error) {
            console.error('Error getting video info:', error);
            return null;
        }
    }

    async downloadAndPlay() {
        if (this.queue.length === 0) return;

        this.isDownloading = true;
        const song = this.queue[0];
        try {
            const resource = await this.createAudioResource(song.url);
            this.isDownloading = false;
            this.player.play(resource);
            this.queue.shift();
            this.tryDownloadNext();
        } catch (err) {
            console.error('Error downloading and playing song:', err);
            this.isDownloading = false;
            this.queue.shift();
            this.playNext();
        }
    }

    async playNext() {
        if (this.queue.length > 0) {
            const nextOutputIndex = (this.currentOutputIndex + 1) % 2;
            try {
                await fs.access(this.outputFiles[nextOutputIndex]);
                const resource = createAudioResource(this.outputFiles[nextOutputIndex]);
                this.player.play(resource);
                this.currentOutputIndex = nextOutputIndex;
                this.queue.shift();
                this.tryDownloadNext();
            } catch (error) {
                console.log('Next song not pre-downloaded, downloading now...');
                await this.downloadAndPlay();
            }
        } else {
            console.log('Queue is empty, nothing to play.');
            this.currentOutputIndex = 0;
            // Delete the previous output files if they exist
            const outputFiles = ['./ytdlp-audio/output1.mp3', './ytdlp-audio/output2.mp3'];
            outputFiles.forEach(file => {
                if (fs.existsSync(file)) {
                    fs.unlinkSync(file); // Delete the file
                    console.log(`Deleted existing file: ${file}`);
                }
            });
        }
    }

    async tryDownloadNext() {
        if (!this.isDownloading && this.queue.length > 0) {
            await this.downloadNext();
        }
    }

    async downloadNext() {
        if (this.queue.length === 0) return;

        this.isDownloading = true;
        const nextSong = this.queue[0];
        const nextOutputIndex = (this.currentOutputIndex + 1) % 2;
        try {
            await this.createAudioResource(nextSong.url, this.outputFiles[nextOutputIndex]);
            console.log('Downloaded next song in the queue.');
        } catch (err) {
            console.error('Error downloading next song:', err);
        } finally {
            this.isDownloading = false;
        }
    }

    async createAudioResource(url, outputFilePath = this.outputFiles[this.currentOutputIndex]) {
        return new Promise((resolve, reject) => {
            fs.unlink(outputFilePath).catch(() => {}).then(() => {
                console.log(`Starting download for: ${url}`);
                const command = `yt-dlp -f bestaudio -o "${outputFilePath}" "${url}"`;
                const ytDlpProcess = exec(command);

                ytDlpProcess.on('exit', async (code) => {
                    if (code === 0) {
                        console.log(`Downloaded: ${outputFilePath}`);
                        const audioResource = createAudioResource(outputFilePath);
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
        });
    }

    skip() {
        this.player.stop();
    }

    getQueue() {
        return this.queue.map(song => song.info.title);
    }
}

module.exports = new Player();