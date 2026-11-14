import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Factory,
  Leaf,
  MapPinned,
  RefreshCw,
  Recycle,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  User,
  Users,
  Warehouse,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { fetchCollectionRecommendations } from './services/collectionService';
import { fetchDIYRecommendations } from './services/reuseService';
import { checkBackendHealth, predictCombined } from './services/predictionService';

const materialOptions = ['Plastic', 'Glass', 'Metal', 'Paper', 'Cardboard', 'Other'];
const conditionOptions = ['clean', 'dry', 'mixed', 'contaminated'];

const demoStats = [
  { label: 'Demo scans', value: '12', tone: 'green' },
  { label: 'Education tips', value: '06', tone: 'blue' },
  { label: 'Local records', value: '03', tone: 'navy' },
];

const recyclingGuide = {
  Plastic: {
    basics: 'Sort bottles, caps and plastic packaging by type when possible and keep them free of food residue.',
    cleaning: 'Rinse containers and allow them to dry before storing them for collection or recycling.',
    contamination: 'Contamination reduces the value of plastic recycling and can lead to rejection at facilities.',
    safety: 'Handle sharp or damaged items with gloves and avoid mixing hazardous waste with recyclables.',
  },
  Glass: {
    basics: 'Keep glass separate from other material streams and avoid mixing with ceramic or window glass.',
    cleaning: 'Empty and rinse containers to remove residues before sorting and storage.',
    contamination: 'Food, liquid or mixed-material contamination can affect the recycling process.',
    safety: 'Wear gloves when handling broken glass and use puncture-resistant containers.',
  },
  Metal: {
    basics: 'Separate cans, tins and scrap metal from general waste and keep them dry.',
    cleaning: 'Rinse containers and remove obvious non-metal attachments when possible.',
    contamination: 'Mixed material items can be hard to process and may cause rejects.',
    safety: 'Use hand protection and keep sharp edges away from your hands and collection bins.',
  },
  Paper: {
    basics: 'Keep paper dry and separate it from plastic films, food waste and liquids.',
    cleaning: 'Do not soak or contaminate paper with food or moisture before sorting.',
    contamination: 'Wet or greasy paper is often unsuitable for recycling, so dry storage matters.',
    safety: 'Store paper in dry conditions and avoid sharp objects near stacks.',
  },
  Cardboard: {
    basics: 'Flatten cardboard boxes and keep them dry to save space and improve sorting.',
    cleaning: 'Remove food residues, tape and plastic liners when practical before collection.',
    contamination: 'Food-soiled cardboard can contaminate the whole cardboard stream.',
    safety: 'Use gloves when moving stacked boxes and avoid pile collapse.',
  },
  Other: {
    basics: 'Keep non-recyclable waste in clearly labelled bins and separate it from reusable items.',
    cleaning: 'Check item packaging or local guidance before placing mixed or uncertain items in collection bins.',
    contamination: 'Contamination can reduce the value and safety of nearby recyclable material streams.',
    safety: 'Handle unknown or mixed waste carefully and avoid direct contact with sharp or chemical items.',
  },
};

const impactNotes = [
  'Collection activity shown here is limited to demo data and should not be confused with verified JijiGreen operational records.',
  'Estimated environmental impact is educational only and should be interpreted as a scenario, not a measured operational saving.',
  'The app does not calculate real carbon or diversion totals from a single image classification result.',
];

const localStorageKey = 'jiji-demo-collections';

function formatPercent(value) {
  if (typeof value === 'number') return `${value.toFixed(2)}%`;
  if (typeof value === 'string' && value !== '') return `${Number(value).toFixed(2)}%`;
  return '—';
}

function getImagePreview(file) {
  if (!file) return '';
  return URL.createObjectURL(file);
}

function PortalLayout({ children, title, subtitle, isCollector = false }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-mark"><Leaf size={18} /></div>
          <div>
            <div className="brand-name">JijiAI</div>
            <small>Intelligent Waste Assistant</small>
          </div>
        </div>
        <nav className="nav-links">
          <Link to="/">Home</Link>
          <Link to="/user">User Portal</Link>
          <Link to="/collector">Collector Portal</Link>
        </nav>
      </header>
      <main className="page-shell">
        <section className="page-header card">
          <div>
            <p className="eyebrow">{isCollector ? 'Collector Portal' : 'User Portal'}</p>
            <h1>{title}</h1>
            <p className="subtle">{subtitle}</p>
          </div>
          <div className="status-pill">
            <ShieldCheck size={16} />
            Demo environment
          </div>
        </section>
        {children}
      </main>
    </div>
  );
}

function HomeScreen() {
  const navigate = useNavigate();

  return (
    <div className="landing-screen">
      <div className="landing-card card">
        <div className="hero-copy">
          <p className="eyebrow">Waste intelligence demo</p>
          <h1>JijiAI — Intelligent Waste Assistant</h1>
          <p>
            Explore a demonstration of material classification, collection guidance and responsible waste handling.
          </p>
          <div className="portal-select">
            <button className="portal-button primary" onClick={() => navigate('/user')}>
              <User size={18} /> User Portal
            </button>
            <button className="portal-button secondary" onClick={() => navigate('/collector')}>
              <Users size={18} /> Collector Portal
            </button>
          </div>
        </div>
        <div className="hero-panel">
          <div className="mini-stat">
            <Recycle size={18} />
            <div>
              <strong>AI scanning</strong>
              <span>Material + experimental brand support</span>
            </div>
          </div>
          <div className="mini-stat">
            <MapPinned size={18} />
            <div>
              <strong>Facility guidance</strong>
              <span>Verified and unverified facility logic</span>
            </div>
          </div>
          <div className="mini-stat">
            <Sparkles size={18} />
            <div>
              <strong>Education-first</strong>
              <span>Guidance rather than unsupported claims</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserPortal() {
  const [selectedMaterial, setSelectedMaterial] = useState('Plastic');
  const [selectedCondition, setSelectedCondition] = useState('clean');
  const [quantity, setQuantity] = useState(5);
  const [coords, setCoords] = useState({ latitude: -1.286389, longitude: 36.817223 });
  const [facilityResults, setFacilityResults] = useState([]);
  const [facilityStatus, setFacilityStatus] = useState('idle');
  const [serviceError, setServiceError] = useState('');
  const [diyState, setDiyState] = useState({ loading: false, data: null, error: '' });
  const [scanner, setScanner] = useState({
    file: null,
    preview: '',
    loading: false,
    result: null,
    error: '',
  });

  useEffect(() => {
    return () => {
      if (scanner.preview) URL.revokeObjectURL(scanner.preview);
    };
  }, [scanner.preview]);

  const handleScanChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setScanner({ file: null, preview: '', loading: false, result: null, error: 'Only JPG and PNG images are supported.' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setScanner({ file: null, preview: '', loading: false, result: null, error: 'Image exceeds the 5 MB limit.' });
      return;
    }

    setScanner({
      file,
      preview: getImagePreview(file),
      loading: false,
      result: null,
      error: '',
    });
  };

  const handlePredict = async () => {
    if (!scanner.file) {
      setScanner((current) => ({ ...current, error: 'Upload an image before scanning.' }));
      return;
    }

    setScanner((current) => ({ ...current, loading: true, error: '' }));

    try {
      const data = await predictCombined(scanner.file, true);
      setScanner((current) => ({ ...current, loading: false, result: data, error: '' }));
    } catch (error) {
      setScanner((current) => ({ ...current, loading: false, error: error.message || 'Prediction failed.' }));
    }
  };

  const handleLocationRequest = () => {
    if (!navigator.geolocation) {
      setServiceError('Geolocation is unavailable in this browser. You can enter coordinates manually.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        setServiceError('Location permission was denied. Coordinates can still be entered manually.');
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const handleRecommendations = async () => {
    setFacilityStatus('loading');
    setServiceError('');
    try {
      const data = await fetchCollectionRecommendations({
        material: selectedMaterial.toLowerCase(),
        condition: selectedCondition,
        quantity_kg: Number(quantity),
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      setFacilityResults(data?.recommendations || []);
      setFacilityStatus(data?.status || 'idle');
    } catch (error) {
      setFacilityStatus('error');
      setServiceError(error.message || 'Unable to fetch collection recommendations.');
    }
  };

  const fetchDIY = async (material) => {
    setDiyState({ loading: true, data: null, error: '' });
    try {
      const data = await fetchDIYRecommendations(material.toLowerCase(), 'user');
      setDiyState({ loading: false, data, error: '' });
    } catch (error) {
      setDiyState({ loading: false, data: null, error: error.message || 'DIY guidance is unavailable.' });
    }
  };

  const currentGuide = useMemo(() => recyclingGuide[selectedMaterial] || recyclingGuide.Other, [selectedMaterial]);

  return (
    <PortalLayout title="Welcome back" subtitle="Track demo activity, scan material, and understand local waste handling guidance." isCollector={false}>
      <div className="dashboard-grid">
        <div className="card wide-card">
          <div className="section-header">
            <h2>Welcome</h2>
            <span className="mini-tag">Demo usage</span>
          </div>
          <div className="stat-grid">
            {demoStats.map((stat) => (
              <div key={stat.label} className={`stat-box ${stat.tone}`}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
          <div className="quick-actions">
            <button className="action-card" onClick={() => document.getElementById('scan-upload')?.click()}>
              <Camera size={18} /> Quick action: scan waste
            </button>
            <button className="action-card" onClick={() => fetchDIY(selectedMaterial)}>
              <Recycle size={18} /> DIY reuse guidance
            </button>
            <button className="action-card" onClick={handleRecommendations}>
              <MapPinned size={18} /> Recycling recommendations
            </button>
          </div>
        </div>

        <div className="card">
          <div className="section-header">
            <h2>Recent demo activity</h2>
            <span className="mini-tag">Local only</span>
          </div>
          <ul className="activity-list">
            <li><span className="dot green" /> Material scan demo completed</li>
            <li><span className="dot blue" /> Collection recommendation check run</li>
            <li><span className="dot navy" /> DIY reuse preview reviewed</li>
          </ul>
          <p className="small-note">These are sample or browser-stored demo records and are not verified JijiGreen collection events.</p>
        </div>
      </div>

      <div className="panel-grid two-col">
        <section className="card">
          <div className="section-header">
            <h2>AI waste scanner</h2>
            <span className="mini-tag warning">Experimental brand model</span>
          </div>
          <div className="upload-box">
            <input id="scan-upload" type="file" accept="image/jpeg,image/png" onChange={handleScanChange} />
            <label htmlFor="scan-upload" className="upload-button"><Upload size={18} /> Upload image</label>
            {scanner.preview && <img src={scanner.preview} alt="Uploaded waste preview" className="image-preview" />}
          </div>
          {scanner.error && <div className="alert error">{scanner.error}</div>}
          {scanner.loading && <div className="loading-card"><RefreshCw className="spin" size={16} /> Loading AI prediction...</div>}
          {!scanner.loading && scanner.result && (
            <div className="result-box">
              <div className="result-row"><strong>Predicted material:</strong> {scanner.result.material?.predicted_material || '—'}</div>
              <div className="result-row"><strong>Material confidence:</strong> {formatPercent(scanner.result.material?.confidence_percent)}</div>
              <div className="result-row"><strong>Second-best material:</strong> {scanner.result.material?.second_best_material || '—'}</div>
              <div className="result-row"><strong>Confidence margin:</strong> {formatPercent(scanner.result.material?.confidence_margin_percent)}</div>
              <div className="result-row"><strong>Prediction status:</strong> {scanner.result.material?.prediction_status || '—'}</div>
              <div className="result-row"><strong>Review reasons:</strong> {scanner.result.material?.review_reasons?.length ? scanner.result.material.review_reasons.join(', ') : 'None flagged'}</div>
              <div className="result-row"><strong>Brand prediction:</strong> {scanner.result.brand_recognition?.result?.predicted_brand || 'No brand result returned for this image'}</div>
              <div className="result-row"><strong>Brand confidence:</strong> {scanner.result.brand_recognition?.result ? formatPercent(scanner.result.brand_recognition.result.confidence_percent) : '—'}</div>
              <div className="notice-panel">
                <CircleAlert size={16} />
                Experimental warning: this model is not a physical verification step. Image-quality validation does not prove the photograph contains waste.
              </div>
              <div className="notice-panel">
                <ClipboardCheck size={16} />
                Human verification notice: a staff member or user must inspect the physical item before acting on the result.
              </div>
            </div>
          )}
          <div className="button-row stacked">
            <button className="primary" onClick={handlePredict}><Sparkles size={16} /> Run analysis</button>
            <button className="secondary" onClick={() => setScanner({ file: null, preview: '', loading: false, result: null, error: '' })}><RefreshCw size={16} /> Reset</button>
          </div>
          <div className="small-note">Supported formats: JPG/JPEG/PNG. Maximum size: 5 MB. The backend determines the confidence percentages.</div>
        </section>

        <section className="card">
          <div className="section-header">
            <h2>Recycling guide</h2>
            <span className="mini-tag">Educational</span>
          </div>
          <select value={selectedMaterial} onChange={(e) => setSelectedMaterial(e.target.value)}>
            {materialOptions.map((material) => <option key={material} value={material}>{material}</option>)}
          </select>
          <div className="guide-list">
            <div><strong>Basic sorting:</strong> {currentGuide.basics}</div>
            <div><strong>Cleaning and preparation:</strong> {currentGuide.cleaning}</div>
            <div><strong>Why contamination matters:</strong> {currentGuide.contamination}</div>
            <div><strong>Safe handling:</strong> {currentGuide.safety}</div>
          </div>
        </section>
      </div>

      <div className="panel-grid two-col">
        <section className="card">
          <div className="section-header">
            <h2>Collection-point recommendations</h2>
            <span className="mini-tag">Live backend</span>
          </div>
          <div className="form-grid compact">
            <select value={selectedMaterial} onChange={(e) => setSelectedMaterial(e.target.value)}>
              {materialOptions.map((material) => <option key={material} value={material}>{material}</option>)}
            </select>
            <select value={selectedCondition} onChange={(e) => setSelectedCondition(e.target.value)}>
              {conditionOptions.map((condition) => <option key={condition} value={condition}>{condition}</option>)}
            </select>
            <input type="number" min="0.1" step="0.1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} placeholder="Quantity kg" />
            <div className="coord-inputs">
              <input type="number" step="0.000001" value={coords.latitude} onChange={(e) => setCoords({ ...coords, latitude: Number(e.target.value) })} placeholder="Latitude" />
              <input type="number" step="0.000001" value={coords.longitude} onChange={(e) => setCoords({ ...coords, longitude: Number(e.target.value) })} placeholder="Longitude" />
            </div>
          </div>
          <div className="button-row">
            <button className="primary" onClick={handleLocationRequest}><MapPinned size={16} /> Use GPS</button>
            <button className="secondary" onClick={handleRecommendations}><ArrowRight size={16} /> Search facilities</button>
          </div>
          {serviceError && <div className="alert error">{serviceError}</div>}
          {facilityStatus === 'loading' && <div className="loading-card"><RefreshCw className="spin" size={16} /> Loading collection guidance...</div>}
          {facilityStatus === 'no_suitable_facilities' && (
            <div className="empty-state">
              <Factory size={18} />
              <p>No suitable verified facility was found in the available JijiGreen, contracted-partner or external recycler datasets. Please confirm acceptance directly with facilities before travel.</p>
            </div>
          )}
          {facilityResults.length > 0 && (
            <div className="facility-list">
              {facilityResults.map((facility) => (
                <div key={`${facility.name}-${facility.facility_id || facility.point_id || facility.partner_id}`} className="facility-card">
                  <div className="facility-head">
                    <strong>{facility.name}</strong>
                    <span>{facility.facility_type}</span>
                  </div>
                  <div className="tiny-grid">
                    <span>Location: {facility.location || 'Not provided'}</span>
                    <span>Distance: {facility.distance_km} km (straight-line, Haversine)</span>
                    <span>Accepted: {facility.accepted_materials?.join(', ') || '—'}</span>
                    <span>Conditions: {facility.accepted_waste_conditions?.join(', ') || '—'}</span>
                    <span>Capacity: {facility.capacity_available_kg ?? 'Not available'}</span>
                    <span>Verification: {facility.verification_status || 'Not specified'}</span>
                    <span>Partnership: {facility.partnership_status || 'not_applicable'}</span>
                    <span>Opening hours: {facility.opening_hours || 'Not specified'}</span>
                    <span>Contact: {facility.contact || 'Not specified'}</span>
                    <span>Website: {facility.website || 'Not specified'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="section-header">
            <h2>DIY reuse projects</h2>
            <span className="mini-tag">Needs review</span>
          </div>
          <button className="primary small" onClick={() => fetchDIY(selectedMaterial)}><Recycle size={16} /> Load project suggestions</button>
          {diyState.loading && <div className="loading-card"><RefreshCw className="spin" size={16} /> Loading reuse suggestions...</div>}
          {diyState.error && <div className="alert error">{diyState.error}</div>}
          {!diyState.loading && diyState.data && diyState.data.recommendations?.length ? (
            <div className="diy-list">
              {diyState.data.recommendations.map((item) => (
                <div key={item.idea_id} className="facility-card">
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                  <div className="tiny-grid">
                    <span>Difficulty: {item.difficulty}</span>
                    <span>Duration: {item.estimated_time_minutes} min</span>
                    <span>Materials: {item.materials_needed?.join(', ')}</span>
                    <span>Verification: {item.verification_status}</span>
                  </div>
                  <div className="notice-panel"><CircleAlert size={16} /> Every project currently carries a needs_review status and should be treated as an unreviewed suggestion.</div>
                  <div className="notice-panel"><ShieldCheck size={16} /> Safety warnings are preserved and must not be removed: {item.safety_warnings}</div>
                  {item.tutorial_url && <a href={item.tutorial_url} target="_blank" rel="noreferrer">Tutorial link</a>}
                  <p>{item.instructions}</p>
                </div>
              ))}
            </div>
          ) : !diyState.loading && diyState.data && !diyState.data.recommendations?.length ? (
            <div className="empty-state">
              <Trash2 size={18} />
              <p>No current DIY project suggestions are available for this material.</p>
            </div>
          ) : null}
        </section>
      </div>

      <section className="card">
        <div className="section-header">
          <h2>Environmental impact</h2>
          <span className="mini-tag">Education</span>
        </div>
        <div className="impact-grid">
          {impactNotes.map((note) => (
            <div key={note} className="impact-note">{note}</div>
          ))}
        </div>
      </section>
    </PortalLayout>
  );
}

function CollectorPortal() {
  const [studentId, setStudentId] = useState('demo-student-01');
  const [assessment, setAssessment] = useState({
    file: null,
    preview: '',
    loading: false,
    result: null,
    error: '',
  });
  const [verification, setVerification] = useState({
    material: '',
    brand: '',
    actualMaterial: '',
    actualBrand: '',
    actualWeightKg: '',
    condition: 'clean',
    notes: '',
    decision: 'pending',
    source: '',
  });
  const [records, setRecords] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(localStorageKey) || '[]');
    } catch (error) {
      return [];
    }
  });

  const handleAssessmentUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setAssessment({ file: null, preview: '', loading: false, result: null, error: 'Only JPG and PNG images are supported.' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAssessment({ file: null, preview: '', loading: false, result: null, error: 'Image exceeds the 5 MB limit.' });
      return;
    }
    setAssessment({ file, preview: getImagePreview(file), loading: false, result: null, error: '' });
  };

  const runAssessment = async () => {
    if (!assessment.file) {
      setAssessment((current) => ({ ...current, error: 'Upload an image to assess.' }));
      return;
    }
    setAssessment((current) => ({ ...current, loading: true, error: '' }));
    try {
      const result = await predictCombined(assessment.file, true);
      setAssessment((current) => ({ ...current, loading: false, result, error: '' }));
      setVerification((current) => ({
        ...current,
        material: result?.material?.predicted_material || '',
        brand: result?.brand_recognition?.result?.predicted_brand || '',
      }));
    } catch (error) {
      setAssessment((current) => ({ ...current, loading: false, error: error.message || 'Assessment failed.' }));
    }
  };

  const saveDemoRecord = () => {
    const confirmedMaterial = verification.actualMaterial || verification.material || assessment.result?.material?.predicted_material || 'Unassigned';
    const confirmedBrand = verification.actualBrand || verification.brand || assessment.result?.brand_recognition?.result?.predicted_brand || 'Unassigned';
    const nextRecord = {
      id: Date.now(),
      studentId,
      predictedMaterial: verification.material || assessment.result?.material?.predicted_material || 'Unassigned',
      predictedBrand: verification.brand || assessment.result?.brand_recognition?.result?.predicted_brand || 'Unassigned',
      confirmedMaterial,
      confirmedBrand,
      weightKg: Number(verification.actualWeightKg || verification.weightKg || 0),
      condition: verification.condition,
      notes: verification.notes,
      verificationDecision: verification.decision,
      source: verification.source,
      createdAt: new Date().toISOString(),
      demo: true,
      status: 'demo-only',
    };

    const existing = JSON.parse(localStorage.getItem(localStorageKey) || '[]');
    const updated = [nextRecord, ...existing].slice(0, 20);
    localStorage.setItem(localStorageKey, JSON.stringify(updated));
    setRecords(updated);
  };

  useEffect(() => {
    localStorage.setItem(localStorageKey, JSON.stringify(records));
  }, [records]);

  const materialBreakdown = useMemo(() => {
    const breakdown = {};
    records.forEach((record) => {
      const key = record.confirmedMaterial || record.predictedMaterial || 'Unassigned';
      breakdown[key] = (breakdown[key] || 0) + Number(record.weightKg || 0);
    });
    return Object.entries(breakdown).map(([name, weight]) => ({ name, weight }));
  }, [records]);

  return (
    <PortalLayout title="Collector dashboard" subtitle="Assess waste, verify material and keep demo-only records separate from operational claims." isCollector>
      <div className="dashboard-grid">
        <div className="card wide-card">
          <div className="section-header">
            <h2>Demo collector identity</h2>
            <span className="mini-tag">Demo mode</span>
          </div>
          <div className="stat-grid">
            <div className="stat-box green"><strong>{records.length}</strong><span>Recorded demo collections</span></div>
            <div className="stat-box blue"><strong>{records.filter((r) => r.verificationDecision === 'pending').length}</strong><span>Pending verification</span></div>
            <div className="stat-box navy"><strong>{materialBreakdown.length}</strong><span>Material categories</span></div>
          </div>
          <div className="form-group">
            <label>Student/demo user ID</label>
            <input value={studentId} onChange={(e) => setStudentId(e.target.value)} />
          </div>
        </div>

        <div className="card">
          <div className="section-header">
            <h2>Recent activity</h2>
            <span className="mini-tag">Local</span>
          </div>
          <ul className="activity-list">
            {records.length === 0 ? <li>No records yet. Demonstration entries appear here.</li> : records.slice(0, 5).map((record) => (
              <li key={record.id}><span className="dot green" /> {record.confirmedMaterial || record.predictedMaterial} • {record.weightKg} kg</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="panel-grid two-col">
        <section className="card">
          <div className="section-header">
            <h2>Waste assessment</h2>
            <span className="mini-tag">AI + inspection</span>
          </div>
          <div className="upload-box">
            <input id="collector-assessment-upload" type="file" accept="image/jpeg,image/png" onChange={handleAssessmentUpload} />
            <label htmlFor="collector-assessment-upload" className="upload-button"><Upload size={18} /> Upload image</label>
            {assessment.preview && <img src={assessment.preview} alt="Waste assessment preview" className="image-preview" />}
          </div>
          {assessment.error && <div className="alert error">{assessment.error}</div>}
          {assessment.loading && <div className="loading-card"><RefreshCw className="spin" size={16} /> Running assessment...</div>}
          {assessment.result && (
            <div className="result-box">
              <div className="result-row"><strong>Predicted material:</strong> {assessment.result.material?.predicted_material || '—'}</div>
              <div className="result-row"><strong>Confidence:</strong> {formatPercent(assessment.result.material?.confidence_percent)}</div>
              <div className="result-row"><strong>Predicted brand:</strong> {assessment.result.brand_recognition?.result?.predicted_brand || 'No brand returned'}</div>
              <div className="notice-panel"><CircleAlert size={16} /> The collector must physically inspect the waste before recording confirmation.</div>
            </div>
          )}
          <button className="primary" onClick={runAssessment}><Camera size={16} /> Analyze image</button>
        </section>

        <section className="card">
          <div className="section-header">
            <h2>AI reference values</h2>
            <span className="mini-tag">Preview only</span>
          </div>
          <div className="form-grid compact">
            <input value={verification.material} onChange={(e) => setVerification({ ...verification, material: e.target.value })} placeholder="AI-predicted material" />
            <input value={verification.brand} onChange={(e) => setVerification({ ...verification, brand: e.target.value })} placeholder="AI-predicted brand" />
            <div className="small-note">These values are a reference only. The collector must confirm the correct material and brand manually.</div>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="section-header">
          <h2>Actual collection verification</h2>
          <span className="mini-tag">Collector input</span>
        </div>
        <div className="form-grid compact">
          <div className="coord-inputs">
            <input value={verification.actualMaterial} onChange={(e) => setVerification({ ...verification, actualMaterial: e.target.value })} placeholder="Actual waste material" />
            <input value={verification.actualBrand} onChange={(e) => setVerification({ ...verification, actualBrand: e.target.value })} placeholder="Actual brand or label" />
          </div>
          <div className="coord-inputs">
            <input value={verification.actualWeightKg} onChange={(e) => setVerification({ ...verification, actualWeightKg: e.target.value })} placeholder="Actual weight in kg" type="number" step="0.1" />
            <input value={verification.source} onChange={(e) => setVerification({ ...verification, source: e.target.value })} placeholder="Source or origin of waste" />
          </div>
          <select value={verification.condition} onChange={(e) => setVerification({ ...verification, condition: e.target.value })}>
            {conditionOptions.map((condition) => <option key={condition} value={condition}>{condition}</option>)}
          </select>
          <textarea value={verification.notes} onChange={(e) => setVerification({ ...verification, notes: e.target.value })} placeholder="Collector notes about the actual waste condition, contamination, damage or preparation" rows="4" />
          <select value={verification.decision} onChange={(e) => setVerification({ ...verification, decision: e.target.value })}>
            <option value="pending">Pending verification</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div className="button-row">
          <button className="primary" onClick={saveDemoRecord}><CheckCircle2 size={16} /> Confirm actual collection</button>
        </div>
        <div className="small-note">This section captures the real, collector-verified details that should be used for the final record, not only the AI estimate.</div>
      </section>

      <section className="card">
        <div className="section-header">
          <h2>Demo collection records</h2>
          <span className="mini-tag">Demo-only</span>
        </div>
        <div className="record-table">
          {records.length === 0 ? <div className="empty-state"><Warehouse size={18} /><p>No demo collection records yet.</p></div> : records.map((record) => (
            <div className="record-row" key={record.id}>
              <div><strong>{record.confirmedMaterial || record.predictedMaterial}</strong></div>
              <div>{record.weightKg} kg</div>
              <div>{record.confirmedBrand || 'No confirmed brand'}</div>
              <div>{new Date(record.createdAt).toLocaleDateString()}</div>
              <div>{record.verificationDecision}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="section-header">
          <h2>Collector-specific reuse guidance</h2>
          <span className="mini-tag">Educational only</span>
        </div>
        <div className="impact-grid">
          <div className="impact-note">This section explains safe sorting and handling practices for collectors. It is not a verified backend DIY recommendation.</div>
          <div className="impact-note">Separate plastic and glass streams, keep materials dry and check for contamination before storage or transfer.</div>
          <div className="impact-note">Use gloves and cut-resistant handling for sharp, damaged or mixed waste items.</div>
        </div>
      </section>
    </PortalLayout>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/user" element={<UserPortal />} />
      <Route path="/collector" element={<CollectorPortal />} />
    </Routes>
  );
}

export default App;
