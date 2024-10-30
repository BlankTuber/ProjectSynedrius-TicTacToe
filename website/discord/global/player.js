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

const CONFIG = {
    MAX_SONG_DURATION: 1200,
    OUTPUT_DIR: './ytdlp-audio',
    DEFAULT_VOLUME: 0.1,
    MAX_RETRY_ATTEMPTS: 5,
    INITIAL_RETRY_DELAY: 1000,
    FILE_CLEANUP_INTERVAL: 60000,
    DOWNLOAD_COOLDOWN: 1000,
    VIDEO_INFO_TIMEOUT: 10000,
    MAX_PLAYLIST_SONGS: 30,
    VOLUME_MULTIPLIER: 100,
    INACTIVITY_TIMEOUT: 5 * 60 * 1000  // 5 minutes in milliseconds
};

class Player {
    constructor() {
        this.player = createAudioPlayer();
        this.queue = [];
        this.connection = null;
        this.inactivityTimer = null;
        this.outputFiles = ['output1.mp3', 'output2.mp3'].map(file => 
            path.join(CONFIG.OUTPUT_DIR, file)
        );
        this.currentOutputIndex = 0;
        this.isDownloading = false;
        this.isPlaying = false;
        this.volume = CONFIG.DEFAULT_VOLUME;
        this.playlistProcessing = false;

        this.setupEventListeners();
        this.initializeOutputDirectory();
    }

    setupEventListeners() {
        this.player.on(AudioPlayerStatus.Playing, () => {
            console.log('Audio is now playing!');
            this.isPlaying = true;
            this.downloadNext(); // Immediately download the next song in queue
        });
        
        

        this.player.on(AudioPlayerStatus.Idle, () => {
            console.log('Audio has finished playing!');
            this.isPlaying = false;
            this.playNext();
        });

        setInterval(() => this.cleanupFiles(), CONFIG.FILE_CLEANUP_INTERVAL);
    }

    async initializeOutputDirectory() {
        await fs.promises.mkdir(CONFIG.OUTPUT_DIR, { recursive: true })
            .catch(console.error);
    }

    async cleanupFiles() {
        if (!this.isPlaying && !this.isDownloading) {
            for (const file of this.outputFiles) {
                await this.deleteFileWithRetry(file);
            }
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
                } catch (error) {
                    this.connection.destroy();
                    reject(error);
                }
            });
        });
    }

    async play(url) {
        this.stopInactivityTimer();
        const videoInfo = await this.getVideoInfo(url);
        if (!videoInfo) {
            console.error('Failed to get video info');
            return;
        }
    
        if (videoInfo.duration > CONFIG.MAX_SONG_DURATION) {
            console.error(`Song exceeds ${CONFIG.MAX_SONG_DURATION} second limit: ${videoInfo.duration} seconds`);
            return;
        }
    
        this.queue.push({ url, info: videoInfo });
    
        // Only download and play if not already playing or downloading
        if (!this.isPlaying && !this.isDownloading) {
            await this.downloadAndPlay();
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
            // Check if the error is related to YouTube Premium restrictions
            if (error.stderr && error.stderr.includes('only available to Music Premium members')) {
                console.error(`Video is restricted to Music Premium members: ${url}`);
            } else {
                console.error('Error getting video info:', error);
            }
            return null; // Return null to signal that this video should be skipped
        }
    }
    

    async getVideoInfoWithTimeout(url) {
        return new Promise(async (resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Timed out getting video info'));
            }, CONFIG.VIDEO_INFO_TIMEOUT);

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
                const resource = createAudioResource(fs.createReadStream(nextOutputFile), {
                    inlineVolume: true
                });
                resource.volume?.setVolume(this.volume);  // Set the desired volume level
    
                this.player.play(resource);
                this.queue.shift();
                this.downloadNext();
            } catch (error) {
                console.log('Next song not pre-downloaded, downloading now...');
                await this.downloadAndPlay();
            }
        } else {
            this.handleEmptyQueue();
            this.startInactivityTimer();
        }
    }

    startInactivityTimer() {
        // Clear any existing timer
        if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    
        // Set a new timer to leave the voice channel after inactivity
        this.inactivityTimer = setTimeout(() => {
            this.leaveChannel();
        }, CONFIG.INACTIVITY_TIMEOUT);
    }
    
    stopInactivityTimer() {
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
            this.inactivityTimer = null;
        }
    }

    leaveChannel() {
        console.log("Inactivity timeout reached. Leaving the voice channel.");
        if (this.connection) {
            this.connection.destroy();
            this.connection = null;
        }
    }
    
    
    
    

    async handleEmptyQueue() {
        console.log('Queue is empty, nothing to play.');
        this.currentOutputIndex = 0;
        for (const file of this.outputFiles) {
            await this.deleteFileWithRetry(file);
        }
    }

    async deleteFileWithRetry(file) {
        for (let attempt = 0; attempt < CONFIG.MAX_RETRY_ATTEMPTS; attempt++) {
            try {
                await new Promise(resolve => 
                    setTimeout(resolve, CONFIG.INITIAL_RETRY_DELAY * Math.pow(2, attempt))
                );
                await fs.promises.access(file, fs.constants.F_OK);
                await fs.promises.unlink(file);
                console.log(`Deleted existing file: ${file}`);
                return;
            } catch (error) {
                if (error.code === 'ENOENT') return;
                console.log(`Attempt ${attempt + 1} to delete ${file} failed: ${error.message}`);
            }
        }
        console.error(`Failed to delete ${file} after ${CONFIG.MAX_RETRY_ATTEMPTS} attempts`);
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
            await new Promise(resolve => setTimeout(resolve, CONFIG.DOWNLOAD_COOLDOWN));
        }
    }

    async addPlaylist(url, maxsongs = 30) {
        if (this.playlistProcessing) {
            console.log('Already processing a playlist, please wait...');
            return;
        }
    
        CONFIG.MAX_PLAYLIST_SONGS = maxsongs;
        this.playlistProcessing = true;
    
        try {
            const { stdout } = await execPromise(`yt-dlp -J --flat-playlist "${url}"`);
            const playlistInfo = JSON.parse(stdout);
    
            if (!playlistInfo.entries || playlistInfo.entries.length === 0) {
                console.error('No videos found in the playlist');
                return;
            }
    
            const entries = playlistInfo.entries.slice(0, CONFIG.MAX_PLAYLIST_SONGS);
            console.log(`Processing playlist with ${entries.length} songs...`);
    
            let firstSongAdded = false;
    
            for (const entry of entries) {
                const videoUrl = `https://www.youtube.com/watch?v=${entry.id}`;
                const videoInfo = await this.getVideoInfo(videoUrl);
    
                // Skip restricted videos (getVideoInfo returns null if restricted)
                if (!videoInfo || videoInfo.duration > CONFIG.MAX_SONG_DURATION) {
                    console.log(`Skipping video: ${videoUrl} (either restricted or too long)`);
                    continue;
                }
    
                if (!this.isPlaying && !this.isDownloading && !firstSongAdded) {
                    // Play the first song immediately and set firstSongAdded to true
                    await this.play(videoUrl);
                    firstSongAdded = true;
                } else {
                    // Queue subsequent songs
                    this.queue.push({ url: videoUrl, info: videoInfo });
                    console.log(`Added to queue: ${videoInfo.title}`);
    
                    // Start downloading the next song in queue if none is currently downloading
                    if (!this.isDownloading && this.queue.length <= 2) {
                        await this.downloadNext();
                    }
                }
            }
    
            console.log(`Successfully added ${this.queue.length + (firstSongAdded ? 1 : 0)} songs to the queue`);
    
        } catch (error) {
            console.error('Error adding playlist:', error);
        } finally {
            this.playlistProcessing = false;
        }
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
                        const resource = createAudioResource(fs.createReadStream(outputFilePath), {
                            inlineVolume: true  // Enable inline volume control on the resource
                        });
                        resource.volume?.setVolume(this.volume);  // Set the initial volume
                        resolve(resource);
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
    

    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        if (this.player.state.status === AudioPlayerStatus.Playing) {
            const resource = this.player.state.resource;
            if (resource?.volume) {
                resource.volume.setVolume(this.volume);
            }
        }
    }
    

    getQueue() {
        return this.queue.map(song => song.info.title);
    }
}

module.exports = new Player();