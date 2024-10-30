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
        fs.promises.mkdir(this.outputDir, { recursive: true }).catch(console.error);
        setInterval(() => this.cleanupFiles(), 60000);
    }
    
    async cleanupFiles() {
        if (!this.isPlaying && !this.isDownloading) {
            for (const file of this.outputFiles) {
                await this.deleteFileWithRetry(file);
            }
        }
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
            const currentOutputFile = this.outputFiles[this.currentOutputIndex];
            await this.deleteFileWithRetry(currentOutputFile);
            
            this.currentOutputIndex = (this.currentOutputIndex + 1) % 2;
            const nextOutputFile = this.outputFiles[this.currentOutputIndex];
            
            try {
                await fs.promises.access(nextOutputFile);
                const resource = createAudioResource(nextOutputFile);
                this.player.play(resource);
                this.queue.shift();
                this.tryDownloadNext();
            } catch (error) {
                console.log('Next song not pre-downloaded, downloading now...');
                await this.downloadAndPlay();
            }
        } else {
            this.handleEmptyQueue();
        }
    }
    
    async handleEmptyQueue() {
        console.log('Queue is empty, nothing to play.');
        this.currentOutputIndex = 0;
        // Delete both output files
        for (const file of this.outputFiles) {
            await this.deleteFileWithRetry(file);
        }
    }

    async deleteFileWithRetry(file, maxRetries = 5, initialDelay = 1000) {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                await new Promise(resolve => setTimeout(resolve, initialDelay * Math.pow(2, attempt)));
                await fs.promises.access(file, fs.constants.F_OK);
                await fs.promises.unlink(file);
                console.log(`Deleted existing file: ${file}`);
                return;
            } catch (error) {
                if (error.code === 'ENOENT') {
                    // File doesn't exist, no need to delete
                    return;
                }
                console.log(`Attempt ${attempt + 1} to delete ${file} failed: ${error.message}`);
            }
        }
        console.error(`Failed to delete ${file} after ${maxRetries} attempts`);
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
            // Add a small delay before allowing the next download
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    async addPlaylist(url, maxSongs = 30) {
        try {
            const { stdout } = await execPromise(`yt-dlp -J --flat-playlist "${url}"`);
            const playlistInfo = JSON.parse(stdout);
    
            if (!playlistInfo.entries || playlistInfo.entries.length === 0) {
                console.error('No videos found in the playlist');
                return;
            }
    
            const songsToAdd = playlistInfo.entries.slice(0, maxSongs);
            let validSongs = [];
    
            for (const entry of songsToAdd) {
                const videoUrl = `https://www.youtube.com/watch?v=${entry.id}`;
                const videoInfo = await this.getVideoInfo(videoUrl);
                if (videoInfo && videoInfo.duration <= this.MAX_SONG_DURATION) {
                    validSongs.push({ url: videoUrl, info: videoInfo });
                }
            }
    
            console.log(`Found ${validSongs.length} valid songs in the playlist`);
    
            // Add all valid songs to the queue
            this.queue.push(...validSongs);
    
            // Download and play the first song if not already playing
            if (!this.isPlaying && !this.isDownloading) {
                await this.downloadAndPlay();
            }
    
            // Download the second song if available and not already downloading
            if (this.queue.length > 1 && !this.isDownloading) {
                await this.downloadNext();
            }
    
            console.log(`Added ${validSongs.length} songs from the playlist to the queue`);
        } catch (error) {
            console.error('Error adding playlist:', error);
        }
    }

    async join(channel) {
        this.connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
        });
    
        return new Promise((resolve, reject) => {
            this.connection.on(VoiceConnectionStatus.Ready, () => {
                console.log('The bot has connected to the channel!');
                this.connection.subscribe(this.player);
                resolve();
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
                    reject(error);
                }
            });
        });
    }
    
    async getVideoInfoWithTimeout(url, timeout) {
        return new Promise(async (resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Timed out getting video info'));
            }, timeout);
    
            try {
                const info = await this.getVideoInfo(url);
                clearTimeout(timer);
                if (info) {
                    resolve(info);
                } else {
                    reject(new Error('Failed to get video info'));
                }
            } catch (error) {
                clearTimeout(timer);
                reject(error);
            }
        });
    }

    async createAudioResource(url, outputFilePath = this.outputFiles[this.currentOutputIndex]) {
        return new Promise((resolve, reject) => {
            fs.promises.unlink(outputFilePath).catch(() => {}).then(() => {
                console.log(`Starting download for: ${url}`);
                const command = `yt-dlp -f bestaudio -o "${outputFilePath}" "${url}"`;
                const ytDlpProcess = exec(command);
    
                ytDlpProcess.on('exit', async (code) => {
                    if (code === 0) {
                        console.log(`Downloaded: ${outputFilePath}`);
                        const audioResource = createAudioResource(fs.createReadStream(outputFilePath));
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
        if (this.isPlaying) {
            this.player.stop();
            this.isPlaying = false;
            this.playNext();
        } else {
            console.log("No song is currently playing.");
        }
    }

    getQueue() {
        return this.queue.map(song => song.info.title);
    }
}

module.exports = new Player();