import { getHomeUrl } from '../utils/homeUrl';

export function FirebaseSetupNotice() {
  const homeUrl = getHomeUrl();

  return (
    <div className="app-loading" style={{ padding: '24px' }}>
      <div className="card card-dark card-pad" style={{ maxWidth: '720px' }}>
        <h1 className="page-title">Job Fair Queuing system</h1>
        <p className="muted">
          This build is loading, but Firebase env values are not configured yet, so the app cannot sign in or load data.
        </p>
        <p className="muted">
          Add the values from <code>.env</code> or your Cloudflare deployment settings, then rebuild.
        </p>
        <div className="row-actions">
          <a className="btn btn-primary" href={homeUrl}>Back to home</a>
          <a className="btn btn-secondary" href="./index.html">Reload app</a>
        </div>
      </div>
    </div>
  );
}
