import { Audio } from 'expo-av';
import { useSettingsStore } from '../store/useSettingsStore';

class SoundService {
  private beepSound: Audio.Sound | null = null;
  private successSound: Audio.Sound | null = null;
  private isLoaded = false;
  private currentForceEarpiece = false;

  async loadSounds() {
    const forceEarpiece = useSettingsStore.getState().forceEarpiece;
    
    // Si ya está cargado y la configuración de auricular no cambió, no recargar
    if (this.isLoaded && this.currentForceEarpiece === forceEarpiece) return;

    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: forceEarpiece,
      });
      
      if (!this.isLoaded) {
        const [beepObj, successObj] = await Promise.all([
          Audio.Sound.createAsync(require('../../assets/sounds/beep.wav')),
          Audio.Sound.createAsync(require('../../assets/sounds/success.wav'))
        ]);
        
        this.beepSound = beepObj.sound;
        this.successSound = successObj.sound;
      }
      
      this.currentForceEarpiece = forceEarpiece;
      this.isLoaded = true;
    } catch (error) {
      console.warn('Error loading sounds', error);
    }
  }

  async playBeep() {
    const enableSound = useSettingsStore.getState().enableSound;
    if (!enableSound) return;

    try {
      await this.loadSounds();
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
    const enableSound = useSettingsStore.getState().enableSound;
    if (!enableSound) return;

    try {
      await this.loadSounds();
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
