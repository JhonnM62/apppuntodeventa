import { Audio } from 'expo-av';

class SoundService {
  private beepSound: Audio.Sound | null = null;
  private successSound: Audio.Sound | null = null;
  private isLoaded = false;

  async loadSounds() {
    if (this.isLoaded) return;
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
      
      const [beepObj, successObj] = await Promise.all([
        Audio.Sound.createAsync(require('../../assets/sounds/beep.wav')),
        Audio.Sound.createAsync(require('../../assets/sounds/success.wav'))
      ]);
      
      this.beepSound = beepObj.sound;
      this.successSound = successObj.sound;
      this.isLoaded = true;
    } catch (error) {
      console.warn('Error loading sounds', error);
    }
  }

  async playBeep() {
    try {
      if (!this.beepSound) await this.loadSounds();
      if (this.beepSound) {
        await this.beepSound.stopAsync();
        await this.beepSound.setVolumeAsync(1.0);
        await this.beepSound.playAsync();
      }
    } catch (error) {
      console.warn('Error playing beep', error);
    }
  }

  async playSuccess() {
    try {
      if (!this.successSound) await this.loadSounds();
      if (this.successSound) {
        await this.successSound.stopAsync();
        await this.successSound.setVolumeAsync(1.0);
        await this.successSound.playAsync();
      }
    } catch (error) {
      console.warn('Error playing success sound', error);
    }
  }

  async unloadSounds() {
    if (this.beepSound) await this.beepSound.unloadAsync();
    if (this.successSound) await this.successSound.unloadAsync();
    this.beepSound = null;
    this.successSound = null;
    this.isLoaded = false;
  }
}

export const soundService = new SoundService();
