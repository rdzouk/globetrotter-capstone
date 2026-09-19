import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Mic, Play, Send, Square, Trash2 } from 'lucide-react';
import { ErrorMessage } from './components';
import { useMediaUrl } from './Media';
import { useApp } from './state';

function durationLabel(seconds) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function VoicePlayback({ path, duration }) {
  const { translate } = useApp();
  const [enabled, setEnabled] = useState(false);
  const media = useMediaUrl(enabled ? path : null);
  return <div className="voice-playback"><ErrorMessage>{media.error}</ErrorMessage>{media.url ? <audio controls preload="metadata" src={media.url} aria-label={translate('Voice note')} onPlay={event => { for (const player of document.querySelectorAll('audio')) if (player !== event.currentTarget) player.pause(); }} /> : <button type="button" className="button secondary" disabled={media.loading} onClick={() => { if (enabled) media.reload(); else setEnabled(true); }}>{media.loading ? <LoaderCircle size={17} className="spin" /> : <Play size={17} />}{translate('Play voice note')}<span>{durationLabel(duration || 0)}</span></button>}</div>;
}

export function VoiceRecorder({ onSend, disabled }) {
  const { translate } = useApp();
  const [phase, setPhase] = useState('idle');
  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const recorder = useRef(null);
  const stream = useRef(null);
  const clock = useRef(null);
  const generation = useRef(0);
  const discard = useRef(false);
  const clientId = useRef(null);

  useEffect(() => () => {
    generation.current += 1;
    clearInterval(clock.current);
    if (recorder.current) {
      recorder.current.onstop = null;
      recorder.current.ondataavailable = null;
      recorder.current.onerror = null;
      if (recorder.current.state !== 'inactive') recorder.current.stop();
    }
    stream.current?.getTracks().forEach(track => track.stop());
  }, []);
  useEffect(() => {
    if (!recording) { setPreview(''); return; }
    const objectUrl = URL.createObjectURL(recording);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [recording]);

  function stop(cancel = false) {
    discard.current = cancel;
    clearInterval(clock.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach(track => track.stop());
    if (cancel) { generation.current += 1; setRecording(null); setPhase('idle'); }
  }

  async function start() {
    setError('');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('Voice recording requires HTTPS or localhost and a supported browser.');
      return;
    }
    const attempt = ++generation.current;
    setPhase('requesting');
    try {
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (attempt !== generation.current) { microphone.getTracks().forEach(track => track.stop()); return; }
      stream.current = microphone;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      const capture = new MediaRecorder(microphone, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 48000 });
      recorder.current = capture;
      const chunks = [];
      let size = 0;
      discard.current = false;
      setRecording(null);
      setSeconds(0);
      capture.ondataavailable = event => {
        if (event.data.size) { chunks.push(event.data); size += event.data.size; }
        if (size > 5 * 1024 * 1024 && capture.state === 'recording') stop();
      };
      capture.onstop = () => {
        clearInterval(clock.current);
        microphone.getTracks().forEach(track => track.stop());
        if (attempt !== generation.current || discard.current) return;
        if (!size || size > 5 * 1024 * 1024) {
          setError(size ? 'Voice notes must be 5 MB or smaller.' : 'This voice note is empty.');
          setPhase('idle');
          return;
        }
        clientId.current = crypto.randomUUID();
        setRecording(new Blob(chunks, { type: capture.mimeType || chunks[0]?.type || 'audio/webm' }));
        setPhase('preview');
      };
      capture.onerror = () => { stop(true); setError('Recording could not start.'); };
      capture.start(250);
      setPhase('recording');
      const started = Date.now();
      clock.current = setInterval(() => {
        const elapsed = (Date.now() - started) / 1000;
        setSeconds(elapsed);
        if (elapsed >= 119) stop();
      }, 250);
    } catch (failure) {
      if (attempt !== generation.current) return;
      stream.current?.getTracks().forEach(track => track.stop());
      setPhase('idle');
      setError(failure.name === 'NotAllowedError' ? 'Microphone permission was denied.' : failure.name === 'NotFoundError' ? 'No microphone found.' : 'Recording could not start.');
    }
  }

  async function send() {
    if (await onSend(recording, clientId.current)) { setRecording(null); setPhase('idle'); }
  }

  return <div className="voice-recorder"><ErrorMessage>{error}</ErrorMessage>
    {phase === 'idle' && <button type="button" className="text-button" disabled={disabled} onClick={start}><Mic size={18} />{translate('Record voice note')}</button>}
    {(phase === 'recording' || phase === 'requesting') && <div className="recording-controls"><span role="status">{phase === 'recording' ? <><span className="recording-dot" />{translate('Recording')} {durationLabel(seconds)}</> : <LoaderCircle size={18} className="spin" />}</span>{phase === 'recording' && <button type="button" className="icon-button" title={translate('Stop recording')} aria-label={translate('Stop recording')} onClick={() => stop()}><Square size={18} /></button>}<button type="button" className="icon-button" title={translate('Discard recording')} aria-label={translate('Discard recording')} onClick={() => stop(true)}><Trash2 size={18} /></button></div>}
    {phase === 'preview' && <div className="voice-preview">{preview && <audio controls src={preview} aria-label={translate('Voice note preview')} />}<button type="button" className="icon-button" disabled={disabled} title={translate('Discard recording')} aria-label={translate('Discard recording')} onClick={() => { setRecording(null); setPhase('idle'); }}><Trash2 size={18} /></button><button type="button" className="button" disabled={disabled} onClick={send}><Send size={17} />{translate(disabled ? 'Sending...' : 'Send voice note')}</button></div>}
  </div>;
}