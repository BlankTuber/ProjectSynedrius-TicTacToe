const { AudioPlayer, AudioPlayerStatus, createAudioPlayer, createAudioResource, VoiceConnectionStatus, joinVoiceChannel, entersState } = require('@discordjs/voice');
const { exec } = require('child_process');
const fs = require('fs').promises;
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
    DOWNLOAD_COOLDOWN: 2000,
    VIDEO_INFO_TIMEOUT: 20000,
    MAX_PLAYLIST_SONGS: 30,
    VOLUME_MULTIPLIER: 100,
    INACTIVITY_TIMEOUT: 5 * 60 * 1000
};

class Player {
    constructor() {
        this.player = createAudioPlayer();
        this.queue = [];
        this.connection = null;
        this.inactivityTimer = null;
        // Reduce to just two output files
        this.outputFiles = ['output1.mp3', 'output2.mp3'].map(file =>
            path.join(CONFIG.OUTPUT_DIR, file)
        );
        this.currentOutputIndex = 0;
        this.isDownloading = false;
        this.isPlaying = false;
        this.volume = CONFIG.DEFAULT_VOLUME;
        this.playlistProcessing = false;
        this.currentResource = null;
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

        setInterval(() => this.cleanupFiles(), CONFIG.FILE_CLEANUP_INTERVAL);
    }

    async initializeOutputDirectory() {
        try {
            await fs.mkdir(CONFIG.OUTPUT_DIR, { recursive: true });
            // Clean up any existing files
            for (const file of this.outputFiles) {
                await this.safeDeleteFile(file);
                const partFile = `${file}.part`;
                await this.safeDeleteFile(partFile);
            }
        } catch (error) {
            console.error('Error initializing output directory:', error);
        }
    }

    async safeDeleteFile(filePath) {
        try {
            await fs.unlink(filePath);
            console.log(`Deleted file: ${filePath}`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error(`Error deleting file ${filePath}:`, error);
            }
        }
    }

    async cleanupFiles() {
        if (!this.isPlaying && !this.isDownloading) {
            for (const file of this.outputFiles) {
                await this.safeDeleteFile(file);
                await this.safeDeleteFile(`${file}.part`);
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

            // Add to queue
            this.queue.push({ url, info: videoInfo });
            console.log(`Added to queue: ${videoInfo.title}`);

            // If nothing is playing and we're not downloading, start playing
            if (!this.isPlaying && !this.isDownloading) {
                await this.downloadAndPlay();
            } 
            // If we're playing but not currently downloading the next song, try to pre-download
            else if (!this.isDownloading && this.queue.length === 1) {
                await this.tryDownloadNext();
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
    
        try {
            // Get the index for the file we want to play
            const nextIndex = (this.currentOutputIndex + 1) % 2;
            const nextFile = this.outputFiles[nextIndex];
    
            // Check if the next file exists before playing
            try {
                await fs.access(nextFile);
                const resource = createAudioResource(nextFile, {
                    inlineVolume: true
                });
                resource.volume.setVolume(this.volume);
                this.currentResource = resource;
    
                // Update indices and start playing
                const oldIndex = this.currentOutputIndex;
                this.currentOutputIndex = nextIndex;
                this.player.play(resource);
                this.queue.shift();
    
                // Wait for 1 second before deleting the old file
                setTimeout(() => this.safeDeleteFile(this.outputFiles[oldIndex]), 1000);
    
                // Try to download the next song if there are more in queue
                if (this.queue.length > 0) {
                    setTimeout(() => this.tryDownloadNext(), 1000);
                }
            } catch (error) {
                // If the next file doesn't exist, download it now
                console.log('Next file not found, downloading now...');
                const resource = await this.createAudioResource(this.queue[0].url);
                this.currentResource = resource;
                this.player.play(resource);
                this.queue.shift();
            }
        } catch (error) {
            console.error('Error in playNext:', error);
            this.queue.shift();
            setTimeout(() => this.playNext(), 1000);
        }
    }

    async getVideoInfo(url) {
        try {
            const { stdout } = await execPromise(`yt-dlp -J "${url}"`);
            const info = JSON.parse(stdout);
            
            // Check for common restriction indicators
            if (info.availability === 'premium_only' || 
                (info._type === 'url' && info.resolution === 'restricted')) {
                console.log(`Video is restricted: ${url}`);
                return null;
            }
            
            return {
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

            for (const entry of entries) {
                const videoUrl = `https://www.youtube.com/watch?v=${entry.id}`;
                const videoInfo = await this.getVideoInfo(videoUrl);
                
                if (videoInfo) {
                    await this.play(videoUrl);
                    addedSongs++;
                } else {
                    console.log(`Skipping restricted or unavailable video: ${videoUrl}`);
                }
                
                // Add a small delay between adding songs to prevent rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            console.log(`Successfully processed playlist - Added ${addedSongs} songs to queue. Queue length: ${this.queue.length}`);
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
        this.isDownloading = true;
        const song = this.queue[0];
        try {
            const resource = await this.createAudioResource(song.url);
            this.currentResource = resource;
            this.isDownloading = false;
            this.player.play(resource);
            this.queue.shift();
            // Only try to download next if there are songs in queue
            if (this.queue.length > 0) {
                setTimeout(() => this.tryDownloadNext(), 1000);
            }
        } catch (err) {
            console.error('Error downloading and playing song:', err);
            this.isDownloading = false;
            this.queue.shift();
            setTimeout(() => this.playNext(), 1000);
        }
    }

    async tryDownloadNext() {
        if (!this.isDownloading && this.queue.length > 0) {
            const nextIndex = (this.currentOutputIndex + 1) % 2;
            
            if (!this.isPlaying || nextIndex !== this.currentOutputIndex) {
                try {
                    this.isDownloading = true;
                    const nextSong = this.queue[0];
                    await this.createAudioResource(nextSong.url, this.outputFiles[nextIndex]);
                    console.log('Successfully pre-downloaded next song');
                } catch (error) {
                    console.error('Error pre-downloading next song:', error);
                } finally {
                    this.isDownloading = false;
                }
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
        this.currentOutputIndex = 0;
        for (const file of this.outputFiles) {
            await this.safeDeleteFile(file);
            await this.safeDeleteFile(`${file}.part`);
        }
    }

    async createAudioResource(url, outputFilePath = this.outputFiles[this.currentOutputIndex]) {
        return new Promise(async (resolve, reject) => {
            try {
                // Ensure any existing file is deleted first
                await this.safeDeleteFile(outputFilePath);
                await this.safeDeleteFile(`${outputFilePath}.part`);

                console.log(`Starting download for: ${url}`);
                const command = `yt-dlp -f "bestaudio/best" --extract-audio --audio-format mp3 --audio-quality 0 -o "${outputFilePath}" "${url}"`;
                
                const ytDlpProcess = exec(command);
                let errorOutput = '';

                ytDlpProcess.stderr.on('data', (data) => {
                    errorOutput += data;
                    console.log(`yt-dlp stderr: ${data}`); // Keep this for debugging
                });

                ytDlpProcess.on('exit', async (code) => {
                    if (code === 0) {
                        try {
                            // Wait a short moment to ensure file is fully written
                            await new Promise(resolve => setTimeout(resolve, 500));
                            // Verify the file exists and is accessible
                            await fs.access(outputFilePath);
                            const resource = createAudioResource(outputFilePath, {
                                inlineVolume: true
                            });
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

    getQueue() {
        return this.queue.map(song => song.info.title);
    }
}

module.exports = new Player();