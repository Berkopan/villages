/** Original, opt-in Web Audio ambience. This uses its own noise, never the world's RNG. */
export class WorldAudio {
  constructor() {
    this.context = null;
    this.enabled = false;
    this.master = null;
    this.wind = null;
    this.nextBird = 0;
    this.nodes = [];
  }

  async toggle() {
    if (this.enabled) {
      this.enabled = false;
      if (this.master) this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.25);
      return false;
    }
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) throw new Error('Bu tarayıcı ortam seslerini desteklemiyor.');
    if (!this.context) this.initialize(Context);
    await this.context.resume();
    this.enabled = true;
    this.master.gain.setTargetAtTime(0.26, this.context.currentTime, 0.4);
    return true;
  }

  initialize(Context) {
    const context = this.context = new Context();
    this.master = context.createGain();
    this.master.gain.value = 0;
    this.master.connect(context.destination);
    const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < data.length; i++) {
      previous = (previous + (Math.random() * 2 - 1) * 0.02) / 1.02;
      data[i] = previous * 3.5;
    }
    const noise = context.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 650;
    const wind = this.wind = context.createGain();
    wind.gain.value = 0.13;
    noise.connect(filter).connect(wind).connect(this.master);
    noise.start();
    this.nodes.push(noise);
  }

  update(world, visible = true) {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    const rainy = ['rain', 'storm'].includes(world.weather?.type);
    this.master.gain.setTargetAtTime(visible ? 0.26 : 0, now, 0.4);
    this.wind.gain.setTargetAtTime(rainy ? 0.3 : world.season === 'winter' ? 0.18 : 0.12, now, 1);
    if (visible && now > this.nextBird && world.season !== 'winter') {
      this.chirp(now, 1800 + Math.random() * 1300);
      this.nextBird = now + 4 + Math.random() * 9;
    }
  }

  chirp(time, frequency) {
    const context = this.context;
    const voice = context.createOscillator();
    const volume = context.createGain();
    voice.type = 'sine';
    voice.frequency.setValueAtTime(frequency, time);
    voice.frequency.exponentialRampToValueAtTime(frequency * 1.38, time + 0.07);
    voice.frequency.exponentialRampToValueAtTime(frequency * 0.87, time + 0.18);
    volume.gain.setValueAtTime(0, time);
    volume.gain.linearRampToValueAtTime(0.12, time + 0.025);
    volume.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    voice.connect(volume).connect(this.master);
    voice.start(time);
    voice.stop(time + 0.22);
    voice.onended = () => { voice.disconnect(); volume.disconnect(); };
  }

  async destroy() {
    for (const node of this.nodes) node.stop();
    if (this.context) await this.context.close();
    this.enabled = false;
  }
}

