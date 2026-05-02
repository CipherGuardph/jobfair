import QRCode from 'qrcode';

export async function createQrCodeDataUrl(value) {
  return QRCode.toDataURL(value, {
    margin: 1,
    scale: 8,
    color: {
      dark: '#0f172a',
      light: '#ffffff'
    }
  });
}

