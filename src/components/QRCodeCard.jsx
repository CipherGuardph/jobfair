export function QRCodeCard({ dataUrl, link }) {
  return (
    <div className="qr-box">
      {dataUrl ? <img src={dataUrl} alt="QR code" width="220" height="220" /> : <div className="muted">Generating QR code...</div>}
      <small style={{ wordBreak: 'break-all' }}>{link}</small>
    </div>
  );
}

