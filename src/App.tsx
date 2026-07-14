import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  ExternalLink,
  FileCheck2,
  LockKeyhole,
  Radio,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { coston2, getNetworkSnapshot, switchToCoston2, type NetworkSnapshot } from './flare'
import { getAuditTrail, makers, nextStage, stageCopy, stages, type StageKey } from './rfqEngine'

const contracts = [
  ['Escrow', 'CinderEscrow.sol'],
  ['FTSO adapter', 'IPriceOracleAdapter'],
  ['FDC adapter', 'IFdcSettlementAdapter'],
  ['TEE signer', 'ECDSA match signature'],
]

const bountyFit = [
  'Private application: encrypted RFQ matching through Flare Confidential Compute',
  'Interoperable asset product: XRPL native XRP settlement releases Coston2 escrow',
  'Meaningful Flare integration: FTSO price guard, FDC payment proof, Coston2 deployment path',
]

function App() {
  const [stage, setStage] = useState<StageKey>('draft')
  const [snapshot, setSnapshot] = useState<NetworkSnapshot | null>(null)
  const [networkState, setNetworkState] = useState<'checking' | 'live' | 'offline'>('checking')
  const [walletStatus, setWalletStatus] = useState('Connect Coston2')

  const currentStage = useMemo(() => stages.findIndex((item) => item.key === stage), [stage])
  const auditTrail = useMemo(() => getAuditTrail(stage), [stage])
  const selectedMaker = makers.find((maker) => maker.selected)

  async function refreshNetwork() {
    setNetworkState('checking')
    try {
      setSnapshot(await getNetworkSnapshot())
      setNetworkState('live')
    } catch {
      setNetworkState('offline')
    }
  }

  async function connectWallet() {
    const provider = (window as Window & { ethereum?: unknown }).ethereum
    if (!provider) {
      setWalletStatus('Wallet not found')
      return
    }

    try {
      await switchToCoston2(provider)
      setWalletStatus('Coston2 ready')
    } catch {
      setWalletStatus('Switch failed')
    }
  }

  useEffect(() => {
    void refreshNetwork()
  }, [])

  return (
    <main className="app-shell">
      <nav className="topbar" aria-label="Primary navigation">
        <div className="brand">
          <span className="brand-mark">C</span>
          <div>
            <strong>Cinder RFQ</strong>
            <span>Private XRP OTC on Flare</span>
          </div>
        </div>
        <div className="topbar-actions">
          <a href={coston2.blockExplorers.default.url} target="_blank" rel="noreferrer">
            Explorer
            <ExternalLink size={14} />
          </a>
          <button type="button" onClick={connectWallet}>
            <Wallet size={17} />
            {walletStatus}
          </button>
        </div>
      </nav>

      <section className="product-grid" aria-label="Cinder RFQ demo">
        <div className="rfq-workbench">
          <div className="workbench-header">
            <div>
              <p className="eyebrow">Live hackathon demo</p>
              <h1>Private price discovery. Public settlement.</h1>
            </div>
            <button type="button" className="icon-button" onClick={refreshNetwork} aria-label="Refresh Coston2 status">
              <RefreshCcw size={18} />
            </button>
          </div>

          <div className="rfq-ticket" aria-label="Current RFQ">
            <div>
              <span>RFQ-7Q2C</span>
              <strong>Buy 1,602.11 XRP</strong>
              <small>Escrow: 1,000.00 USDT0 on Coston2</small>
            </div>
            <div className="reference-chip">
              <Copy size={14} />
              XRPL memo 0x7Q2C
            </div>
          </div>

          <div className="stage-meter" aria-label="Settlement progress">
            {stages.map((item, index) => (
              <button
                type="button"
                key={item.key}
                className={index <= currentStage ? 'stage is-complete' : 'stage'}
                onClick={() => setStage(item.key)}
              >
                <span>{index + 1}</span>
                {item.label}
              </button>
            ))}
          </div>

          <div className="stage-panel">
            <div>
              <p className="eyebrow">Current step</p>
              <h2>{stages[currentStage].label}</h2>
              <p>{stageCopy[stage]}</p>
            </div>
            <button type="button" onClick={() => setStage(nextStage(stage))}>
              Advance demo
              <ArrowRight size={17} />
            </button>
          </div>

          <div className="quote-table" aria-label="Encrypted maker quotes">
            {makers.map((maker) => (
              <article key={maker.name} className={maker.selected ? 'quote is-selected' : 'quote'}>
                <div>
                  <h3>{maker.name}</h3>
                  <p>{maker.desk}</p>
                </div>
                <div className="quote-metric">
                  <span>{maker.encryptedQuote}</span>
                  <strong>{stage === 'draft' || stage === 'quoted' ? 'sealed' : `$${maker.quoteUsd.toFixed(4)}`}</strong>
                </div>
                <small>{maker.spreadBps} bps spread</small>
              </article>
            ))}
          </div>
        </div>

        <aside className="signal-panel" aria-label="Flare integration signals">
          <section className="network-band">
            <div>
              <p className="eyebrow">Coston2 RPC</p>
              <h2>{networkState === 'live' ? 'Live' : networkState === 'checking' ? 'Checking' : 'Offline'}</h2>
            </div>
            <Radio className={networkState === 'live' ? 'pulse' : ''} size={24} />
            <dl>
              <div>
                <dt>Chain</dt>
                <dd>114</dd>
              </div>
              <div>
                <dt>Block</dt>
                <dd>{snapshot ? snapshot.blockNumber.toString() : '...'}</dd>
              </div>
              <div>
                <dt>Latency</dt>
                <dd>{snapshot ? `${snapshot.latencyMs} ms` : '...'}</dd>
              </div>
            </dl>
          </section>

          <section className="settlement-card">
            <div className="settlement-title">
              <ShieldCheck size={21} />
              <h2>Winning route</h2>
            </div>
            <p>{selectedMaker?.name} receives escrow after FDC verifies native XRP landed on XRPL with the exact RFQ reference.</p>
            <div className="route-line">
              <span>Coston2 USDT0</span>
              <ArrowRight size={15} />
              <span>XRPL XRP</span>
              <ArrowRight size={15} />
              <span>FDC proof</span>
            </div>
          </section>

          <section className="audit">
            <h2>On-chain audit trail</h2>
            {auditTrail.map((event) => (
              <div key={event.label} className={`audit-row ${event.status}`}>
                {event.status === 'done' ? <CheckCircle2 size={18} /> : <Activity size={18} />}
                <div>
                  <strong>{event.label}</strong>
                  <span>{event.detail}</span>
                </div>
              </div>
            ))}
          </section>
        </aside>
      </section>

      <section className="details-grid">
        <article>
          <LockKeyhole size={22} />
          <h2>Why it is not generic</h2>
          <p>Cinder solves a real institutional flow: buy native XRP without leaking trade intent, while still giving the buyer public settlement guarantees.</p>
        </article>
        <article>
          <CircleDollarSign size={22} />
          <h2>Judging fit</h2>
          {bountyFit.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </article>
        <article>
          <FileCheck2 size={22} />
          <h2>Technical surface</h2>
          {contracts.map(([label, value]) => (
            <p key={label}>
              <strong>{label}</strong>
              <span>{value}</span>
            </p>
          ))}
        </article>
        <article>
          <Sparkles size={22} />
          <h2>Roadmap</h2>
          <p>Pilot maker onboarding, live FCC extension deployment, real XRPL testnet proof submission, then FXRP/FAssets route expansion.</p>
        </article>
      </section>
    </main>
  )
}

declare global {
  interface Window {
    ethereum?: unknown
  }
}

export default App
        </div>
      </section>

      <div className="ticks"></div>
      <section id="spacer"></section>
    </>
  )
}

export default App
