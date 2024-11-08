const { AudioPlayer, AudioPlayerStatus, createAudioPlayer, createAudioResource, VoiceConnectionStatus, joinVoiceChannel, entersState } = require('@discordjs/voice');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const util = require('util');
const crypto = require('crypto');

const execPromise = util.promisify(exec);

const CONFIG = {
    MAX_SONG_DURATION: 1200,
    OUTPUT_DIR: './ytdlp-audio',
    DEFAULT_VOLUME: 0.1,
    MAX_RETRY_ATTEMPTS: 5,
    INITIAL_RETRY_DELAY: 1000,
    FILE_CLEANUP_INTERVAL: 60000,
    DOWNLOAD_COOLDOWN: 2000,
    VIDEO_INFO_TIMEOUT: 20000,
    MAX_PLAYLIST_SONGS: 30,
    VOLUME_MULTIPLIER: 100,
    INACTIVITY_TIMEOUT: 5 * 60 * 1000,
    PRE_DOWNLOAD_COUNT: 2,
    MAX_CONCURRENT_DOWNLOADS: 3
};

class Player {
    constructor() {
        this.player = createAudioPlayer();
        this.queue = [];
        this.connection = null;
        this.inactivityTimer = null;
        this.currentOutputIndex = 0;
        this.isDownloading = false;
        this.isPlaying = false;
        this.volume = CONFIG.DEFAULT_VOLUME;
        this.playlistProcessing = false;
        this.currentResource = null;
        this.downloadQueue = [];
        this.isDownloading = false;
        this.activeDownloads = 0;
        this.setupEventListeners();
        this.initializeOutputDirectory();
    }

    setupEventListeners() {
        this.player.on(AudioPlayerStatus.Playing, () => {
        console.log('Audio is now playing!');
        this.isPlaying = true;
        this.tryDownloadNext();
        });

        this.player.on(AudioPlayerStatus.Idle, () => {
        console.log('Audio has finished playing!');
        this.isPlaying = false;
        if (this.currentResource) {
            this.currentResource = null;
        }
        this.playNext();
        });

        this.player.on('error', error => {
        console.error('Error in audio player:', error);
        this.isPlaying = false;
        this.currentResource = null;
        setTimeout(() => this.playNext(), 1000);
        });
    }

    async initializeOutputDirectory() {
        try {
        await fs.mkdir(CONFIG.OUTPUT_DIR, { recursive: true });
        } catch (error) {
        console.error('Error initializing output directory:', error);
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

        this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
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
        try {
            const videoInfo = await this.getVideoInfoWithTimeout(url);
            if (!videoInfo) {
                console.error('Failed to get video info');
                return;
            }

            if (videoInfo.duration > CONFIG.MAX_SONG_DURATION) {
                console.error(`Song exceeds ${CONFIG.MAX_SONG_DURATION} second limit: ${videoInfo.duration} seconds`);
                return;
            }

            const song = { url, info: videoInfo };
            
            if (!this.isPlaying && this.queue.length === 0) {
                // If nothing is playing and the queue is empty, play immediately
                this.queue.push(song);
                await this.downloadAndPlay();
            } else {
                // Otherwise, add to queue and ensure predownloads
                this.queue.push(song);
                console.log(`Added to queue: ${videoInfo.title}`);
                this.ensurePredownloads();
            }
        } catch (error) {
            console.error('Error in play function:', error);
        }
    }

    async playNext() {
        if (this.queue.length === 0) {
            this.handleEmptyQueue();
            this.startInactivityTimer();
            return;
        }
    
        const nextSong = this.queue.shift();
        const outputFile = this.getOutputFile(nextSong.info.id);
    
        try {
            await fs.access(outputFile);
            const resource = createAudioResource(outputFile, { inlineVolume: true });
            resource.volume.setVolume(this.volume);
            this.currentResource = resource;
            this.player.play(resource);
        } catch (error) {
            console.log('File not found, downloading now...');
            const resource = await this.createAudioResource(nextSong.url, outputFile);
            this.currentResource = resource;
            this.player.play(resource);
        }
    
        this.ensurePredownloads();
    }

    async getVideoInfo(url) {
        try {
        const { stdout } = await execPromise(`yt-dlp -J "${url}"`);
        const info = JSON.parse(stdout);
        if (info.availability === 'premium_only' ||
            (info._type === 'url' && info.resolution === 'restricted')) {
            console.log(`Video is restricted: ${url}`);
            return null;
        }

        return {
            id: info.id,
            title: info.title,
            duration: info.duration,
            thumbnail: info.thumbnail
        };
        } catch (error) {
        if (error.stderr && error.stderr.includes('only available to Music Premium members')) {
            console.log(`Video is restricted to Music Premium members: ${url}`);
        } else if (error.stderr && error.stderr.includes('Private video')) {
            console.log(`Video is private: ${url}`);
        } else if (error.stderr && error.stderr.includes('Video unavailable')) {
            console.log(`Video is unavailable: ${url}`);
        } else {
            console.error('Error getting video info:', error);
        }
        return null;
        }
    }

    async addPlaylist(url, maxsongs = 30) {
        if (this.playlistProcessing) {
            console.log('Already processing a playlist, please wait...');
            return;
        }
    
        CONFIG.MAX_PLAYLIST_SONGS = maxsongs;
        this.playlistProcessing = true;
        let addedSongs = 0;
        try {
            const { stdout } = await execPromise(`yt-dlp -J --flat-playlist "${url}"`);
            const playlistInfo = JSON.parse(stdout);
            if (!playlistInfo.entries || playlistInfo.entries.length === 0) {
                console.error('No videos found in the playlist');
                return;
            }
    
            const entries = playlistInfo.entries.slice(0, CONFIG.MAX_PLAYLIST_SONGS);
            console.log(`Processing playlist with ${entries.length} songs...`);
        
            // Use Promise.all to process songs in parallel
            const promises = entries.map(async (entry) => {
                const videoUrl = `https://www.youtube.com/watch?v=${entry.id}`;
                const videoInfo = await this.getVideoInfo(videoUrl);
                if (videoInfo) {
                    this.queue.push({ url: videoUrl, info: videoInfo });
                    addedSongs++;
                } else {
                    console.log(`Skipping restricted or unavailable video: ${videoUrl}`);
                }
            });
    
            await Promise.all(promises);
    
            console.log(`Successfully processed playlist - Added ${addedSongs} songs to queue. Queue length: ${this.queue.length}`);
        
            if (!this.isPlaying && !this.isDownloading) {
                await this.playNext();
            }
        } catch (error) {
            console.error('Error adding playlist:', error);
        } finally {
            this.playlistProcessing = false;
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
        
        const song = this.queue[0];
        this.isDownloading = true;
        
        try {
            console.log(`Downloading and playing: ${song.info.title}`);
            const resource = await this.createAudioResource(song.url);
            this.currentResource = resource;
            this.isDownloading = false;
            this.player.play(resource);
            this.queue.shift();
            this.ensurePredownloads();
        } catch (err) {
            console.error('Error downloading and playing song:', err);
            this.isDownloading = false;
            this.queue.shift();
            this.playNext();
        }
    }

    async tryDownloadNext() {
        if (!this.isDownloading && this.queue.length > 0) {
        try {
            this.isDownloading = true;
            const nextSong = this.queue[0];
            await this.createAudioResource(nextSong.url);
            console.log('Successfully pre-downloaded next song');
        } catch (error) {
            console.error('Error pre-downloading next song:', error);
        } finally {
            this.isDownloading = false;
        }
        }
    }

    startInactivityTimer() {
        if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
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
    }

    getFilePath(videoId) {
        const hash = crypto.createHash('md5').update(videoId).digest('hex');
        return path.join(CONFIG.OUTPUT_DIR, `${hash}.mp3`);
    }

    queueDownload(url) {
        this.downloadQueue.push(url);
        this.processDownloadQueue();
    }

    async processDownloadQueue() {
        if (this.isDownloading || this.downloadQueue.length === 0) return;

        this.isDownloading = true;
        const { url, outputFile } = this.downloadQueue.shift();

        try {
            await this.createAudioResource(url, outputFile);
            console.log(`Successfully predownloaded: ${url}`);
        } catch (error) {
            console.error('Error predownloading song:', error);
        } finally {
            this.isDownloading = false;
            if (this.downloadQueue.length > 0) {
                this.processDownloadQueue();
            }
        }
    }

    ensurePredownloads() {
        const currentDownloads = this.downloadQueue.length + (this.isDownloading ? 1 : 0);
        const neededDownloads = Math.max(0, CONFIG.MAX_PREDOWNLOAD - currentDownloads);

        for (let i = 0; i < neededDownloads && i < this.queue.length; i++) {
            const song = this.queue[i];
            if (!song.downloading) {
                const outputFile = this.getOutputFile(song.info.id);
                this.downloadQueue.push({ url: song.url, outputFile });
                song.downloading = true;
            }
        }

        if (!this.isDownloading && this.downloadQueue.length > 0) {
            this.processDownloadQueue();
        }
    }
    
    getOutputFile(videoId) {
        return path.join(CONFIG.OUTPUT_DIR, `${videoId}.mp3`);
    }
    
    async createAudioResource(url) {
        return new Promise(async (resolve, reject) => {
            try {
                const videoInfo = await this.getVideoInfo(url);
                if (!videoInfo) {
                reject(new Error('Failed to get video info'));
                return;
                }

                const outputFilePath = this.getFilePath(videoInfo.id);

                try {
                    await fs.access(outputFilePath);
                    console.log(`File already exists: ${outputFilePath}`);
                    const resource = createAudioResource(outputFilePath, { inlineVolume: true });
                    resource.volume.setVolume(this.volume);
                    resolve(resource);
                } catch (error) {
                    console.log(`Starting download for: ${url}`);
                    const command = `yt-dlp -f "bestaudio/best" --extract-audio --audio-format mp3 --audio-quality 0 -o "${outputFilePath}" "${url}"`;
                    const ytDlpProcess = exec(command);

                    let errorOutput = '';
                    ytDlpProcess.stderr.on('data', (data) => {
                        errorOutput += data;
                        console.log(`yt-dlp stderr: ${data}`);
                    });

                    ytDlpProcess.on('exit', async (code) => {
                        if (code === 0) {
                        try {
                            await new Promise(resolve => setTimeout(resolve, 500));
                            await fs.access(outputFilePath);
                            const resource = createAudioResource(outputFilePath, { inlineVolume: true });
                            resource.volume.setVolume(this.volume);
                            resolve(resource);
                        } catch (error) {
                            reject(new Error(`File not accessible after download: ${error.message}`));
                        }
                        } else {
                        reject(new Error(`yt-dlp failed with code ${code}: ${errorOutput}`));
                    }
                });

                ytDlpProcess.on('error', (error) => {
                    reject(new Error(`Failed to execute yt-dlp: ${error.message}`));
                });
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        if (this.player.state.status === AudioPlayerStatus.Playing && this.currentResource) {
        this.currentResource.volume.setVolume(this.volume);
        }
    }

    async skip() {
        if (this.isPlaying) {
            this.player.stop();
            console.log('Skipped current song');
        } else {
            console.log('No song is currently playing');
        }
    }
        
    clearQueue() {
        this.queue = [];
        console.log('Queue has been cleared');
    }
    
    removeFromQueue(index) {
        if (index >= 0 && index < this.queue.length) {
            const removedSong = this.queue.splice(index, 1)[0];
            console.log(`Removed song from queue: ${removedSong.info.title}`);
        } else {
            console.log('Invalid queue index');
        }
    }
    
    pause() {
        if (this.isPlaying) {
            this.player.pause();
            console.log('Playback paused');
        } else {
            console.log('No song is currently playing');
        }
    }
    
    resume() {
        if (this.player.state.status === AudioPlayerStatus.Paused) {
            this.player.unpause();
            console.log('Playback resumed');
        } else {
            console.log('Playback is not paused');
        }
    }
    
    shuffle() {
        for (let i = this.queue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
        }
        console.log('Queue has been shuffled');
    }

    getQueue() {
        return this.queue.map(song => song.info.title);
    }
}

module.exports = new Player();