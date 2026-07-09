import React, { forwardRef, useImperativeHandle, useRef } from 'react';

let SignatureScreen: any = null;
try {
  SignatureScreen = require('react-native-signature-canvas').default;
} catch (e) {
  console.warn('react-native-signature-canvas no está disponible');
}

interface SignatureCanvasRef {
  clearSignature: () => void;
  readSignature: () => void;
}

interface Props {
  onOK: (signature: string) => void;
  onBegin?: () => void;
  backgroundColor?: string;
  penColor?: string;
  minWidth?: number;
  maxWidth?: number;
}

const webStyle = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #ffffff; }
  .m-signature-pad {
    box-shadow: none; border: none;
    width: 100%; height: 100%; min-height: 100vh;
  }
  .m-signature-pad--body {
    border: none;
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  }
  .m-signature-pad--footer { display: none !important; }
  canvas { width: 100% !important; height: 100% !important; }
`;

const SignatureCanvas = forwardRef<SignatureCanvasRef, Props>(
  ({ onOK, onBegin, backgroundColor = '#ffffff', penColor = '#1e293b', minWidth = 1.5, maxWidth = 3 }, ref) => {
    const innerRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      clearSignature: () => innerRef.current?.clearSignature(),
      readSignature: () => innerRef.current?.readSignature(),
    }));

    if (!SignatureScreen) {
      return null;
    }

    return (
      <SignatureScreen
        ref={innerRef}
        onOK={onOK}
        onBegin={onBegin}
        webStyle={webStyle}
        backgroundColor={backgroundColor}
        penColor={penColor}
        minWidth={minWidth}
        maxWidth={maxWidth}
        style={{ flex: 1 }}
      />
    );
  }
);

export default SignatureCanvas;
