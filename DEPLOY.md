# Deploying to Firebase

The app deploys as two pieces that share one origin:

- **Frontend** — a static SPA (SvelteKit `adapter-static`) served by **Firebase Hosting**.
- **Backend** — the stateless FastAPI + Qiskit app running on **Cloud Run** (scales to
  zero).

Firebase Hosting rewrites `/api/**` and `/health` to the Cloud Run service, so the browser
only ever talks to the Hosting domain — same origin, no CORS, and the IonQ API key (when
used) travels in the request body over HTTPS and is never stored. The backend is **stateless**
(no `circuit_id`, no database — the spec is posted on each call), which is what lets it run on
Cloud Run's ephemeral, scale-to-zero instances.

```
browser ──► Firebase Hosting (frontend/build)
               │  /api/**, /health
               └──► Cloud Run: superposition-backend (FastAPI + Qiskit)
```

## Cost (very low volume, ~1 year)

- **Hosting**: free tier (10 GB storage, generous transfer) — effectively $0.
- **Cloud Run**: scales to zero, so there is **no idle charge**. Low traffic stays inside
  the always-free monthly tier (≈2M requests, 360k GiB-s, 180k vCPU-s). Expected bill ≈ **$0/mo**.
- Requires the **Blaze (pay-as-you-go)** plan because Cloud Run needs billing enabled. The
  free tiers still apply; `--max-instances=2` caps any runaway cost.
- **Cold start**: after an idle period the first request takes ~5–8s while Qiskit imports.
  Subsequent requests are fast. Acceptable at this volume; if it ever matters, set
  `--min-instances=1` (small always-on cost) to keep one instance warm.

## Projects & tools — one project, two CLIs

You need **one** project, not two. A Firebase project *is* a Google Cloud project — the
same project with the same ID, viewed through two consoles. Creating the Firebase project
automatically created the matching GCP project; there is no separate GCP project to set up.

But you do need **both CLIs**, because each deploys a different half:

| Tool | Deploys | Needed for |
|---|---|---|
| `firebase-tools` | Firebase Hosting | the frontend (`build/`) |
| `gcloud` (Google Cloud SDK) | Cloud Run | the backend container |

The Firebase CLI can't deploy a Cloud Run container, so `gcloud` is required even though
everything lives in one Firebase project.

> **Use the exact Project ID**, not the display name. In the Firebase console see
> *Project settings → Project ID*. If the name was taken when you created the project,
> Firebase appended a suffix (e.g. `superposition-sequencer-4f2a`). That exact ID must match
> in three places: `.firebaserc`, `gcloud config set project`, and the `serviceId`/`region`
> in `firebase.json` (region must match where you deploy Cloud Run).

## One-time setup

```sh
# Tools
npm install -g firebase-tools          # Firebase CLI (frontend / Hosting)
```

Install the **gcloud CLI** (backend / Cloud Run). On macOS, either:

```sh
# Option A — Homebrew (simplest)
brew install --cask google-cloud-sdk

# Option B — official installer (no Homebrew). Downloads, unpacks, and runs the
# installer; restart your shell afterwards so `gcloud` is on PATH.
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
```

Verify it's on PATH: `gcloud --version`. (Other platforms / details:
https://cloud.google.com/sdk/docs/install)

Then authenticate both CLIs:

```sh
# Auth (run these yourself in the terminal — prefix with ! in this session)
firebase login
gcloud auth login

# Aim BOTH CLIs at the same project (the one Firebase already created — no new
# project), then switch it to the Blaze plan in the Firebase console (Billing).
gcloud config set project YOUR_FIREBASE_PROJECT_ID
```

The project id is already set to `superposition-sequencer` in `.firebaserc` — change it there
if your actual Project ID differs (see the note above).

Enable the APIs Cloud Run / Cloud Build need:

```sh
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

Grant the build service account permission to build. `gcloud run deploy --source` builds
your Dockerfile with Cloud Build, running as the project's **Compute Engine default service
account**. On recently-created projects that account starts without the permissions to read
the uploaded source / push the image, so the first deploy fails with a `storage.objects.get`
403. Grant it the Cloud Build builder role once (covers Storage read, Artifact Registry
push, and log writing):

```sh
PROJECT_NUMBER=$(gcloud projects describe superposition-sequencer --format='value(projectNumber)')
gcloud projects add-iam-policy-binding superposition-sequencer \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.builder"
```

IAM changes take ~a minute to propagate, so if a deploy started before this, just re-run it.

## Deploy the backend (Cloud Run)

From the repo root. `--source backend` builds the image from `backend/Dockerfile`:

```sh
gcloud run deploy superposition-backend \
  --source backend \
  --region europe-southwest1 \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=2 \
  --memory=1Gi \
  --cpu=1 \
  --concurrency=80
```

The service id (`superposition-backend`) and region (`europe-southwest1`, Madrid — lowest
latency from Spain) must match the `rewrites` in `firebase.json`. If you deploy to a
different region, update both there. Other nearby options: `europe-west9` (Paris),
`europe-west1` (Belgium), `europe-west3` (Frankfurt).

The Hosting rewrite (and the browser) call the service anonymously, so it must be publicly
invokable. `--allow-unauthenticated` does this, but if the deploy prints *"Setting IAM policy
failed"* it didn't apply — grant the public invoker role explicitly:

```sh
gcloud run services add-iam-policy-binding superposition-backend \
  --region=europe-southwest1 --member=allUsers --role=roles/run.invoker
```

If *that* errors about `Domain Restricted Sharing` / `constraints/iam.allowedPolicyMemberDomains`,
an org policy is blocking `allUsers` (common on Google Workspace orgs). Override that
constraint for this project — set it to *Allow All* in the console
(IAM & Admin → Organization Policies → Domain restricted sharing), which needs the
**Organization Policy Administrator** role — then re-run the invoker grant above.

Quick check:

```sh
curl https://<your-cloud-run-url>/health      # {"status":"ok"}
```

## Deploy the frontend (Hosting)

```sh
cd frontend
npm install            # first time only
npm run build          # outputs to frontend/build
cd ..
firebase deploy --only hosting
```

Open the Hosting URL. Editing a circuit should update the Bloch spheres and MI matrix
(that's the `/api/circuit` round trip working through the rewrite), and the **Run** button
should execute shots on Aer.

## Redeploys

- Backend code changed → re-run the `gcloud run deploy` command.
- Frontend code changed → `npm run build` then `firebase deploy --only hosting`.

## Local development

Unchanged — see `RUNNING.md`. In dev, Vite proxies `/api` to the local FastAPI on `:8000`;
in production, the Hosting rewrite does the same job. No code or env var differs between the
two.
