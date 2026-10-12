import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Platform,
  useWindowDimensions,
  Image,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Line, Rect, Circle, Ellipse, Defs, Mask } from 'react-native-svg';
import { WebView } from 'react-native-webview';
import { validarRostroIA } from '../../services/api';

let ImagePicker: any;
try {
  ImagePicker = require('expo-image-picker');
} catch (_e) {
  // Fallback si no está instalado
}

export interface FacialCaptureModalProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onCapture: (fotoUri: string) => void;
  onClose: () => void;
}

// HTML y Script optimizado para la cámara en tiempo real en Native WebView (Android/iOS)
const getNativeCameraHtml = () => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body { width:100%; height:100%; background:#000000; overflow:hidden; }
    #videoContainer { width:100%; height:100%; position:relative; overflow:hidden; }
    video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      background: #000000;
    }
  </style>
</head>
<body>
  <div id="videoContainer">
    <video id="v" autoplay playsinline webkit-playsinline muted></video>
  </div>
  <script>
    var currentStream = null;
    var currentFacing = 'user';

    function post(type, payload) {
      var msg = JSON.stringify(Object.assign({ type: type }, payload || {}));
      function trySend(attempts) {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(msg);
        } else if (attempts < 30) {
          setTimeout(function() { trySend(attempts + 1); }, 100);
        }
      }
      trySend(0);
    }

    async function initCamera(facing) {
      if (currentStream) {
        currentStream.getTracks().forEach(function(t) { t.stop(); });
        currentStream = null;
      }
      currentFacing = facing || 'user';
      var video = document.getElementById('v');
      video.style.transform = currentFacing === 'user' ? 'scaleX(-1)' : 'none';

      video.onloadeddata = function() { post('ready'); };
      video.onplaying = function() { post('ready'); };

      try {
        var constraints = {
          audio: false,
          video: {
            facingMode: currentFacing
          }
        };
        var stream = await navigator.mediaDevices.getUserMedia(constraints);
        currentStream = stream;
        video.srcObject = stream;
        video.play().then(function() { post('ready'); }).catch(function(e) { console.warn('play err', e); });
        post('ready');
      } catch (err) {
        post('error', { message: err.name || err.message || 'camera_error' });
      }
    }

    function takeSnapshot() {
      var video = document.getElementById('v');
      if (!video) return;
      var w = video.videoWidth || 720;
      var h = video.videoHeight || 1280;
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (currentFacing === 'user') {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, w, h);
      var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      post('snapshot', { uri: dataUrl });
    }

    function switchCamera() {
      var next = currentFacing === 'user' ? 'environment' : 'user';
      initCamera(next);
    }

    window.takeSnapshot = takeSnapshot;
    window.switchCamera = switchCamera;

    document.addEventListener('DOMContentLoaded', function() { initCamera('user'); });
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      initCamera('user');
    }
  </script>
</body>
</html>
`;

export default function FacialCaptureModal({
  visible,
  title = 'Registro Facial',
  subtitle = 'Ubica tu rostro y hombros dentro de la silueta en posición vertical',
  onCapture,
  onClose,
}: FacialCaptureModalProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [streamActive, setStreamActive] = useState(false);
  const [loadingCamera, setLoadingCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [validatingAI, setValidatingAI] = useState(false);
  const [aiValidationError, setAiValidationError] = useState<string | null>(null);

  // Referencias para Web
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Referencia para Native WebView
  const webViewRef = useRef<WebView | null>(null);

  // Detener el stream de cámara en Web
  const stopWebStream = useCallback(() => {
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      } catch (_e) {}
      mediaStreamRef.current = null;
    }
    setStreamActive(false);
  }, []);

  // Iniciar la cámara en Web (Safari iOS, Google Chrome, etc.)
  const startWebStream = useCallback(async (mode: 'user' | 'environment') => {
    if (Platform.OS !== 'web') return;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError('Cámara en vivo no soportada o requiere conexión segura (HTTPS).');
      return;
    }

    setLoadingCamera(true);
    setCameraError(null);

    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch (_e) {}
      mediaStreamRef.current = null;
    }

    try {
      // Constraints limpios y universales (crucial para evitar OverconstrainedError en iOS Safari)
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: mode,
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      const videoEl = videoRef.current;
      if (videoEl) {
        videoEl.setAttribute('playsinline', 'true');
        videoEl.setAttribute('webkit-playsinline', 'true');
        videoEl.setAttribute('autoplay', 'true');
        videoEl.setAttribute('muted', 'true');
        videoEl.muted = true;
        videoEl.defaultMuted = true;
        videoEl.srcObject = stream;

        videoEl.onloadedmetadata = () => {
          videoEl.play().catch((err) => {
            console.warn('Video play caught:', err);
          });
        };
        videoEl.play().catch(() => {});
      }
      setStreamActive(true);
    } catch (err: any) {
      console.warn('Error getUserMedia web:', err);
      let errMsg = 'No se pudo acceder a la cámara en vivo.';
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        errMsg = 'Permiso denegado. Permite el acceso a la cámara en los ajustes del navegador.';
      } else if (err?.name === 'NotFoundError') {
        errMsg = 'No se encontró ninguna cámara disponible en el dispositivo.';
      }
      setCameraError(errMsg);
    } finally {
      setLoadingCamera(false);
    }
  }, []);

  // Ciclo de vida al abrir/cerrar modal
  useEffect(() => {
    if (visible) {
      setCapturedUri(null);
      setCameraError(null);

      if (Platform.OS === 'web') {
        startWebStream(facingMode);
      } else {
        // En nativo solicitar permisos de Android si ImagePicker está disponible
        if (ImagePicker?.requestCameraPermissionsAsync) {
          ImagePicker.requestCameraPermissionsAsync().then(({ status }: any) => {
            if (status !== 'granted') {
              setCameraError('Permiso de cámara denegado. Actívalo en los ajustes de tu teléfono.');
            } else {
              setLoadingCamera(true);
            }
          }).catch(() => {
            setLoadingCamera(true);
          });
        } else {
          setLoadingCamera(true);
        }
      }
    } else {
      if (Platform.OS === 'web') {
        stopWebStream();
      }
      setCapturedUri(null);
      setStreamActive(false);
    }

    return () => {
      if (Platform.OS === 'web') {
        stopWebStream();
      }
    };
  }, [visible, facingMode, startWebStream, stopWebStream]);

  // Temporizador de seguridad: oculta el indicador de carga para no tapar la cara del usuario
  useEffect(() => {
    let t: any;
    if (loadingCamera) {
      t = setTimeout(() => {
        setLoadingCamera(false);
      }, 1000);
    }
    return () => {
      if (t) clearTimeout(t);
    };
  }, [loadingCamera]);

  // Capturar snapshot desde Web
  const captureWebSnapshot = () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      const w = video.videoWidth || 720;
      const h = video.videoHeight || 1280;

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (facingMode === 'user') {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(video, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setCapturedUri(dataUrl);
      stopWebStream();
    } catch (e) {
      console.error('Error al capturar snapshot en web:', e);
      setCameraError('Error al procesar la captura de imagen.');
    }
  };

  // Capturar snapshot en Native (inyección a WebView)
  const captureNativeSnapshot = () => {
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript('window.takeSnapshot && window.takeSnapshot(); true;');
    }
  };

  // Disparador de foto unificado
  const handleShutterPress = () => {
    if (Platform.OS === 'web') {
      captureWebSnapshot();
    } else {
      captureNativeSnapshot();
    }
  };

  // Cambiar cámara frontal / trasera
  const handleToggleFacing = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);

    if (Platform.OS === 'web') {
      startWebStream(nextMode);
    } else if (webViewRef.current) {
      webViewRef.current.injectJavaScript('window.switchCamera && window.switchCamera(); true;');
    }
  };

  // Manejador de mensajes desde el WebView nativo
  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'ready') {
        setStreamActive(true);
        setLoadingCamera(false);
        setCameraError(null);
      } else if (data.type === 'snapshot' && data.uri) {
        setCapturedUri(data.uri);
      } else if (data.type === 'error') {
        setLoadingCamera(false);
        setCameraError(data.message || 'No se pudo acceder a la cámara en el dispositivo.');
      }
    } catch (_e) {}
  };

  // Repetir foto
  const handleRetake = () => {
    setCapturedUri(null);
    setCameraError(null);
    setAiValidationError(null);
    setValidatingAI(false);
    if (Platform.OS === 'web') {
      startWebStream(facingMode);
    } else {
      setStreamActive(true);
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`window.initCamera && window.initCamera('${facingMode}'); true;`);
      }
    }
  };

  // Confirmar y entregar la foto capturada previa validación con IA
  const handleConfirm = async () => {
    if (!capturedUri || validatingAI) return;

    setValidatingAI(true);
    setAiValidationError(null);

    try {
      const res = await validarRostroIA(capturedUri);
      if (res && res.valido === false) {
        setAiValidationError(res.motivo || 'No se detecta un rostro humano mirando de frente a la cámara.');
        setValidatingAI(false);
        return;
      }

      onCapture(capturedUri);
      handleClose();
    } catch (err: any) {
      console.warn('[FacialCaptureModal] Error en validación IA (fallback permisivo):', err);
      // Fallback: no bloquear al empleado si hay error de red o timeout
      onCapture(capturedUri);
      handleClose();
    } finally {
      setValidatingAI(false);
    }
  };

  const handleClose = () => {
    stopWebStream();
    setCapturedUri(null);
    setAiValidationError(null);
    setValidatingAI(false);
    onClose();
  };

  // Fallback de emergencia exclusivo para cuando el hardware/navegador bloquea completamente la cámara
  const launchFallbackPicker = async () => {
    if (!ImagePicker) return;
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        cameraType: ImagePicker.CameraType.front,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        let uriToUse = asset.uri;
        if (asset.base64) {
          uriToUse = asset.base64.startsWith('data:') ? asset.base64 : `data:image/jpeg;base64,${asset.base64}`;
        }
        setCapturedUri(uriToUse);
        setCameraError(null);
      }
    } catch (err: any) {
      console.warn('Fallback camera error:', err);
    }
  };

  if (!visible) return null;

  // Cálculo de espacio seguro para Status Bar, Notch e Isla Dinámica
  const androidStatusHeight = Platform.OS === 'android' ? (StatusBar.currentHeight || 36) : 0;
  const safeTop = Math.max(
    insets.top,
    androidStatusHeight,
    Platform.OS === 'ios' ? 48 : (Platform.OS === 'android' ? 40 : 20)
  );

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={handleClose}>
      <StatusBar barStyle="light-content" translucent={Platform.OS === 'android'} backgroundColor="#000000" />
      <View style={styles.modalRoot}>
        {/* 1. ESPACIADOR SEGURO DEDICADO PARA STATUS BAR / NOTCH / ISLA DINÁMICA */}
        <View style={{ height: safeTop, backgroundColor: '#09090b', width: '100%' }} />

        {/* 2. ENCABEZADO INDEPENDIENTE (NUNCA QUEDA OCULTO NI SOBREPUESTO) */}
        <View style={styles.header}>
          <View style={styles.headerTextCol}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={handleClose}
            accessibilityLabel="Cerrar modal"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* ALERTA DE ORIENTACIÓN HORIZONTAL */}
        {isLandscape && (
          <View style={styles.landscapeWarningBanner}>
            <Ionicons name="phone-portrait-outline" size={20} color="#fef08a" />
            <Text style={styles.landscapeWarningText}>
              Gira tu dispositivo a posición VERTICAL para que tu rostro quede centrado correctamente.
            </Text>
          </View>
        )}

        {/* CONTENEDOR PRINCIPAL DEL VIEWPORT DE CÁMARA */}
        <View style={styles.cameraViewport}>
          {/* FOTO YA CAPTURADA */}
          {capturedUri ? (
            <Image source={{ uri: capturedUri }} style={styles.capturedImage} resizeMode="cover" />
          ) : Platform.OS === 'web' ? (
            /* STREAM EN VIVO EN WEB (Safari iOS, Chrome Android, Chrome Desktop) */
            <View style={styles.streamWrapper}>
              {/* @ts-ignore */}
              <video
                ref={(el: HTMLVideoElement | null) => {
                  if (el) {
                    videoRef.current = el;
                    el.setAttribute('playsinline', 'true');
                    el.setAttribute('webkit-playsinline', 'true');
                    el.setAttribute('autoplay', 'true');
                    el.setAttribute('muted', 'true');
                    el.muted = true;
                    el.defaultMuted = true;
                    if (mediaStreamRef.current && el.srcObject !== mediaStreamRef.current) {
                      el.srcObject = mediaStreamRef.current;
                      el.play().catch(() => {});
                    }
                  }
                }}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                  backgroundColor: '#000000',
                }}
              />
              {loadingCamera && (
                <View style={styles.cameraLoadingOverlay}>
                  <ActivityIndicator size="large" color="#38bdf8" />
                  <Text style={styles.cameraLoadingText}>Iniciando cámara en vivo...</Text>
                </View>
              )}
            </View>
          ) : (
            /* STREAM EN VIVO EN NATIVO (Vía WebView integrada sin salir de la app) */
            <View style={styles.streamWrapper}>
              <WebView
                ref={webViewRef}
                source={{ html: getNativeCameraHtml(), baseUrl: 'https://localhost' }}
                style={styles.webView}
                originWhitelist={['*']}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                mediaCapturePermissionGrantType="grant"
                onMessage={handleWebViewMessage}
                onLoadEnd={() => setLoadingCamera(false)}
              />
              {loadingCamera && (
                <View style={styles.cameraLoadingOverlay}>
                  <ActivityIndicator size="large" color="#38bdf8" />
                  <Text style={styles.cameraLoadingText}>Iniciando cámara en vivo...</Text>
                </View>
              )}
            </View>
          )}

          {/* OVERLAY: SILUETA DE PERSONA REAL (BUSTO HUMANO ELEGANTE) */}
          <View style={styles.silhouetteOverlay} pointerEvents="none">
            <Svg viewBox="0 0 360 540" style={StyleSheet.absoluteFill}>
              <Defs>
                <Mask id="personBodyMask">
                  <Rect x="0" y="0" width="360" height="540" fill="#ffffff" />
                  {/* Recorte exacto y amplio de la forma de una persona (cabeza, cuello y hombros) */}
                  <Path
                    d={`
                      M 180 45
                      C 120 45, 88 95, 88 160
                      C 88 225, 130 285, 138 296
                      C 134 325, 95 360, 35 405
                      C 12 430, 0 470, 0 540
                      L 360 540
                      C 360 470, 348 430, 325 405
                      C 265 360, 226 325, 222 296
                      C 230 285, 272 225, 272 160
                      C 272 95, 240 45, 180 45
                      Z
                    `}
                    fill="#000000"
                  />
                </Mask>
              </Defs>

              {/* Capa oscura exterior con recorte transparente amplio */}
              <Rect
                x="0"
                y="0"
                width="360"
                height="540"
                fill="rgba(0, 0, 0, 0.65)"
                mask="url(#personBodyMask)"
              />

              {/* Contorno limpio y amplio de la persona (cabeza, cuello y hombros) */}
              <Path
                d={`
                  M 0 540
                  C 0 470, 12 430, 35 405
                  C 95 360, 134 325, 138 296
                  C 130 285, 88 225, 88 160
                  C 88 95, 120 45, 180 45
                  C 240 45, 272 95, 272 160
                  C 272 225, 230 285, 222 296
                  C 226 325, 265 360, 325 405
                  C 348 430, 360 470, 360 540
                `}
                fill="none"
                stroke={aiValidationError ? '#ef4444' : capturedUri ? '#10b981' : '#ffffff'}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Guía facial interior amplia (arco de mentón y mandíbula) */}
              <Path
                d="M 112 165 C 112 235, 142 282, 180 282 C 218 282, 248 235, 248 165"
                fill="none"
                stroke={aiValidationError ? '#ef4444' : capturedUri ? '#10b981' : 'rgba(255, 255, 255, 0.45)'}
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
            </Svg>

            {/* Chip guía de estado de encuadre */}
            <View style={[styles.guideBadge, aiValidationError ? { backgroundColor: 'rgba(239, 68, 68, 0.85)', borderColor: '#ef4444' } : null]}>
              <Ionicons
                name={aiValidationError ? 'alert-circle' : validatingAI ? 'sync-outline' : capturedUri ? 'checkmark-circle' : 'scan-outline'}
                size={16}
                color={aiValidationError ? '#ffffff' : validatingAI ? '#38bdf8' : capturedUri ? '#10b981' : '#ffffff'}
                style={{ marginRight: 6 }}
              />
              <Text style={styles.guideBadgeText}>
                {aiValidationError
                  ? 'Foto rechazada: rostro no válido'
                  : validatingAI
                  ? 'Validando rostro con IA...'
                  : capturedUri
                  ? 'Foto encuadrada - Confirma si es correcta'
                  : 'Ubica tu rostro y hombros dentro de la silueta'}
              </Text>
            </View>
          </View>

          {/* AVISO DE ERROR CON ACCIÓN DE CONTINGENCIA */}
          {cameraError && !capturedUri && (
            <View style={styles.errorContainer}>
              <View style={styles.errorNoticeBadge}>
                <Ionicons name="alert-circle" size={20} color="#ef4444" style={{ marginRight: 8 }} />
                <Text style={styles.errorNoticeText}>{cameraError}</Text>
              </View>
              <View style={styles.errorActionsRow}>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => {
                    setCameraError(null);
                    if (Platform.OS === 'web') startWebStream(facingMode);
                    else handleRetake();
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="refresh" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.retryBtnText}>Reintentar</Text>
                </TouchableOpacity>

                {ImagePicker && (
                  <TouchableOpacity
                    style={styles.fallbackCamBtn}
                    onPress={launchFallbackPicker}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="camera" size={16} color="#38bdf8" style={{ marginRight: 6 }} />
                    <Text style={styles.fallbackCamBtnText}>Abrir cámara del teléfono</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </View>

        {/* BARRA INFERIOR DE ACCIONES */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 6 }]}>
          {capturedUri ? (
            /* BOTONES POST-CAPTURA (Repetir Foto y Confirmar) */
            <View style={{ width: '100%' }}>
              {aiValidationError && (
                <View style={styles.aiErrorBanner}>
                  <Ionicons name="alert-circle" size={22} color="#ef4444" style={{ marginRight: 8, marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.aiErrorTitle}>Foto Rechazada</Text>
                    <Text style={styles.aiErrorText}>{aiValidationError}</Text>
                    <Text style={styles.aiErrorHint}>Toca "Repetir Foto" para encuadrarte de nuevo de frente.</Text>
                  </View>
                </View>
              )}

              <View style={styles.postCaptureActions}>
                <TouchableOpacity style={styles.retakeBtn} onPress={handleRetake} activeOpacity={0.85}>
                  <Ionicons name="refresh-outline" size={20} color="#f1f5f9" style={{ marginRight: 8 }} />
                  <Text style={styles.retakeBtnText} numberOfLines={1}>Repetir Foto</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.confirmBtn, (validatingAI || !!aiValidationError) && { opacity: validatingAI ? 0.7 : 0.4, backgroundColor: aiValidationError ? '#4b5563' : '#10b981' }]}
                  onPress={handleConfirm}
                  disabled={validatingAI || !!aiValidationError}
                  activeOpacity={0.85}
                >
                  {validatingAI ? (
                    <>
                      <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />
                      <Text style={styles.confirmBtnText} numberOfLines={1}>Verificando...</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={22} color="#ffffff" style={{ marginRight: 8 }} />
                      <Text style={styles.confirmBtnText} numberOfLines={1}>Confirmar</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* CONTROLES DE CÁMARA EN VIVO (Obturador central + Voltear cámara) */
            <View style={styles.liveCaptureActions}>
              <TouchableOpacity
                style={styles.switchCamBtn}
                onPress={handleToggleFacing}
                accessibilityLabel="Voltear cámara"
                activeOpacity={0.7}
              >
                <Ionicons name="camera-reverse" size={26} color="#ffffff" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.shutterBtn, isLandscape && { borderColor: '#facc15' }]}
                onPress={handleShutterPress}
                accessibilityLabel="Capturar fotografía"
                activeOpacity={0.8}
              >
                <View style={[styles.shutterInner, isLandscape && { backgroundColor: '#fef08a' }]} />
              </TouchableOpacity>

              <View style={{ width: 50 }} />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#09090b',
    borderBottomWidth: 1,
    borderBottomColor: '#18181b',
    zIndex: 20,
  },
  headerTextCol: {
    flex: 1,
    paddingRight: 12,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    color: '#a1a1aa',
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  landscapeWarningBanner: {
    backgroundColor: '#854d0e',
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  landscapeWarningText: {
    color: '#fef08a',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },
  cameraViewport: {
    flex: 1,
    backgroundColor: '#000000',
    position: 'relative',
    overflow: 'hidden',
  },
  streamWrapper: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  webView: {
    flex: 1,
    backgroundColor: '#000000',
  },
  cameraLoadingOverlay: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    zIndex: 50,
  },
  cameraLoadingText: {
    color: '#ffffff',
    fontSize: 13,
    marginLeft: 8,
    fontWeight: '500',
  },
  capturedImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  silhouetteOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 12,
  },
  guideBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(9, 9, 11, 0.92)',
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    marginTop: 8,
  },
  guideBadgeText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '600',
  },
  errorContainer: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    zIndex: 30,
  },
  errorNoticeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.22)',
    borderWidth: 1,
    borderColor: '#ef4444',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  errorNoticeText: {
    color: '#fca5a5',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  errorActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#27272a',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  retryBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  fallbackCamBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: '#3f3f46',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  fallbackCamBtnText: {
    color: '#e4e4e7',
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    backgroundColor: '#09090b',
    paddingTop: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#18181b',
  },
  liveCaptureActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
  },
  switchCamBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#ffffff',
  },
  postCaptureActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  retakeBtn: {
    flex: 1,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  retakeBtnText: {
    color: '#f1f5f9',
    fontWeight: '600',
    fontSize: 15,
  },
  confirmBtn: {
    flex: 1.25,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    borderRadius: 14,
    paddingHorizontal: 12,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  confirmBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.3,
  },
  aiErrorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  aiErrorTitle: {
    color: '#ef4444',
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 1,
  },
  aiErrorText: {
    color: '#fecaca',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  aiErrorHint: {
    color: '#f87171',
    fontSize: 11,
    fontWeight: '400',
  },
});
