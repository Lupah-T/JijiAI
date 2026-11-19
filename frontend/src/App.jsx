import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Award,
  Camera,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Factory,
  Info,
  Leaf,
  LocateFixed,
  Map,
  MapPinned,
  RefreshCw,
  Recycle,
  ShieldCheck,
  Sparkles,
  TreePine,
  Trash2,
  Upload,
  User,
  Users,
  Warehouse,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';
import { fetchCollectionRecommendations } from './services/collectionService';
import { fetchDIYRecommendations } from './services/reuseService';
import { predictCombined } from './services/predictionService';

const materialOptions = ['Plastic', 'Glass', 'Metal', 'Paper', 'Cardboard', 'Other'];
const conditionOptions = ['clean', 'dry', 'mixed', 'contaminated'];
const defaultLocation = { latitude: -1.286389, longitude: 36.817223 };
const localStorageKey = 'jiji-demo-collections';

const collectionPoints = [
  {
    id: 'campus-hub',
    name: 'JijiGreen Campus Hub',
    address: 'Main Campus, Nairobi',
    latitude: -1.2866,
    longitude: 36.8176,
    materials: ['Plastic', 'Paper', 'Cardboard', 'Glass'],
    status: 'Open today',
    hours: '08:00–18:00',
    phone: '+254 700 0001',
  },
  {
    id: 'market-collection',
    name: 'Market Recovery Point',
    address: 'Kibera Market Square',
    latitude: -1.2915,
    longitude: 36.8212,
    materials: ['Plastic', 'Metal', 'Cardboard'],
    status: 'High demand',
    hours: '07:00–17:30',
    phone: '+254 700 0002',
  },
  {
    id: 'community-center',
    name: 'Green Community Center',
    address: 'Westlands Community Hub',
    latitude: -1.2798,
    longitude: 36.8089,
    materials: ['Plastic', 'Glass', 'Paper', 'Metal'],
    status: 'Open today',
    hours: '09:00–18:00',
    phone: '+254 700 0003',
  },
  {
    id: 'residence-point',
    name: 'Jiji Residence Drop-off',
    address: 'South B Residential Area',
    latitude: -1.3004,
    longitude: 36.8108,
    materials: ['Plastic', 'Paper', 'Glass'],
    status: 'Available',
    hours: '08:00–20:00',
    phone: '+254 700 0004',
  },
];

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

const educationCards = [
  {
    title: 'Greenhouse gases',
    description: 'Methane, carbon dioxide and other gases are linked to waste handling and landfill behaviour. Better sorting can reduce avoidable emissions.',
    fact: 'Waste prevention and recycling can reduce the need for virgin material extraction and processing.',
    action: 'Separate clean recyclables from general waste and reduce mixed contamination.',
  },
  {
    title: 'Plastic pollution',
    description: 'Plastic can remain in the environment for many years depending on the material and conditions. Caring for plastic waste matters.',
    fact: 'Recycling and reuse reduce demand for newly manufactured plastic and help protect local ecosystems.',
    action: 'Rinse bottles and packaging before placing them in the correct recycling stream.',
  },
  {
    title: 'Circular economy',
    description: 'A circular economy keeps useful materials in use for longer and reduces waste sent to landfill or incineration.',
    fact: 'Repair, reuse and recycling all reduce pressure on finite natural resources.',
    action: 'Choose durable, repairable products and keep recyclable materials clean.',
  },
  {
    title: 'Responsible separation',
    description: 'Clear separation helps collectors and recyclers process material efficiently and safely.',
    fact: 'Contaminated materials can be rejected or require additional handling, which reduces efficiency.',
    action: 'Keep paper, cardboard, metal, glass and plastics in separate streams whenever possible.',
  },
];

function formatPercent(value) {
  if (typeof value === 'number') return `${value.toFixed(2)}%`;
  if (typeof value === 'string' && value !== '') return `${Number(value).toFixed(2)}%`;
  return '—';
}

function formatDistance(metres) {
  if (!Number.isFinite(metres)) return '—';
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

function getImagePreview(file) {
  if (!file) return '';
  return URL.createObjectURL(file);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c * 1000;
}

function readDemoRecords() {
  try {
    return JSON.parse(localStorage.getItem(localStorageKey) || '[]');
  } catch (error) {
    return [];
  }
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
            Explore a demonstration of material classification, live location discovery, and responsible waste handling.
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
              <strong>Live map</strong>
              <span>Nearest collection point discovery</span>
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

function DemoMapPanel({ userLocation, selectedMaterial }) {
  const mapRef = useRef(null);
  const points = useMemo(() => {
    const withDistance = collectionPoints.map((point) => ({
      ...point,
      distanceMetres: haversineKm(
        userLocation.latitude,
        userLocation.longitude,
        point.latitude,
        point.longitude,
      ),
    }));

    const materialMatches = withDistance.filter((point) =>
      point.materials.includes(selectedMaterial),
    );

    return (materialMatches.length ? materialMatches : withDistance).sort(
      (a, b) => a.distanceMetres - b.distanceMetres,
    );
  }, [selectedMaterial, userLocation]);

  const nearestPoint = points[0];

  useEffect(() => {
    if (!mapRef.current) return undefined;

    const map = L.map(mapRef.current, { zoomControl: true }).setView(
      [userLocation.latitude, userLocation.longitude],
      13,
    );

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const userPin = L.circleMarker([userLocation.latitude, userLocation.longitude], {
      radius: 11,
      color: '#1d7f57',
      weight: 3,
      fillColor: '#9ae6b4',
      fillOpacity: 1,
    }).addTo(map);
    userPin.bindPopup(`<strong>Your location</strong><br/>${userLocation.latitude.toFixed(5)}, ${userLocation.longitude.toFixed(5)}`);

    const pointIcon = (title) => L.divIcon({
      html: `<div class="map-point-pin"><span>${title}</span></div>`,
      className: 'map-point-wrapper',
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -25],
    });

    const pointMarkers = points.slice(0, 6).map((point) => {
      const marker = L.marker([point.latitude, point.longitude], {
        icon: pointIcon(point.name.charAt(0)),
      }).addTo(map);
      marker.bindPopup(`
        <strong>${point.name}</strong><br/>
        ${point.address}<br/>
        Materials: ${point.materials.join(', ')}<br/>
        Status: ${point.status}<br/>
        Distance: ${formatDistance(point.distanceMetres)}<br/>
        ${point.phone}`);
      return marker;
    });

    if (nearestPoint) {
      const nearestBounds = L.latLngBounds(
        [userLocation.latitude, userLocation.longitude],
        [nearestPoint.latitude, nearestPoint.longitude],
      );
      map.fitBounds(nearestBounds.pad(0.25), { animate: true });
    }

    return () => {
      map.remove();
      pointMarkers.forEach((marker) => marker.remove());
      userPin.remove();
    };
  }, [nearestPoint, points, userLocation]);

  return (
    <div className="map-block">
      <div className="map-toolbar">
        <div className="map-legend">
          <span><i className="legend-user" /> Your location</span>
          <span><i className="legend-point" /> Collection point</span>
        </div>
        <div className="map-status">{nearestPoint ? `Nearest suitable point: ${nearestPoint.name} • ${formatDistance(nearestPoint.distanceMetres)}` : 'No suitable point found for this material'}</div>
      </div>
      <div ref={mapRef} className="demo-map" />
      <div className="map-detail-grid">
        <div className="map-detail-card">
          <strong>Your live/demo coordinates</strong>
          <span>{userLocation.latitude.toFixed(5)}, {userLocation.longitude.toFixed(5)}</span>
        </div>
        <div className="map-detail-card">
          <strong>Nearest suitable point</strong>
          <span>{nearestPoint ? `${nearestPoint.name} — ${formatDistance(nearestPoint.distanceMetres)} away` : 'No available match'}</span>
        </div>
      </div>
    </div>
  );
}

function UserPortal() {
  const [selectedMaterial, setSelectedMaterial] = useState('Plastic');
  const [selectedCondition, setSelectedCondition] = useState('clean');
  const [quantity, setQuantity] = useState(5);
  const [locationState, setLocationState] = useState({
    status: 'demo',
    position: defaultLocation,
    error: '',
  });
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
  const [dashboardRecords, setDashboardRecords] = useState(() => readDemoRecords());

  useEffect(() => {
    const refresh = () => setDashboardRecords(readDemoRecords());
    window.addEventListener('jiji-data-refresh', refresh);
    return () => window.removeEventListener('jiji-data-refresh', refresh);
  }, []);

  useEffect(() => {
    return () => {
      if (scanner.preview) URL.revokeObjectURL(scanner.preview);
    };
  }, [scanner.preview]);

  const mapPoints = useMemo(() => {
    return collectionPoints
      .map((point) => ({
        ...point,
        distanceMetres: haversineKm(
          locationState.position.latitude,
          locationState.position.longitude,
          point.latitude,
          point.longitude,
        ),
      }))
      .filter((point) => point.materials.includes(selectedMaterial))
      .sort((a, b) => a.distanceMetres - b.distanceMetres);
  }, [locationState.position, selectedMaterial]);

  const nearestCollectionPoint = mapPoints[0];

  const dashboardMetrics = useMemo(() => {
    const verifiedRecords = dashboardRecords.filter((record) => record.verificationDecision === 'accepted');
    const totalSubmissions = dashboardRecords.length;
    const totalVerifiedWeight = verifiedRecords.reduce((sum, record) => sum + Number(record.weightKg || 0), 0);
    const totalEcoPoints = verifiedRecords.reduce((sum, record) => sum + Math.max(10, Math.round((Number(record.weightKg || 0) * 15))), 0);
    const co2Avoided = Number((totalVerifiedWeight * 0.9).toFixed(2));
    const materialBreakdown = verifiedRecords.reduce((acc, record) => {
      const key = record.confirmedMaterial || record.predictedMaterial || 'Unassigned';
      acc[key] = (acc[key] || 0) + Number(record.weightKg || 0);
      return acc;
    }, {});
    const achievements = [];
    if (verifiedRecords.length >= 1) achievements.push('First Recycler');
    if (totalVerifiedWeight >= 5) achievements.push('Waste Warrior');
    if (co2Avoided >= 5) achievements.push('Carbon Saver');
    if (totalEcoPoints >= 100) achievements.push('Green Champion');

    return {
      totalSubmissions,
      totalVerifiedWeight,
      totalEcoPoints,
      co2Avoided,
      materialBreakdown,
      achievements,
    };
  }, [dashboardRecords]);

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
      setLocationState({ status: 'demo', position: defaultLocation, error: 'Geolocation is unavailable in this browser. Demo coordinates are being used.' });
      return;
    }

    setLocationState((current) => ({ ...current, status: 'loading', error: '' }));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationState({
          status: 'live',
          position: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
          error: '',
        });
      },
      () => {
        setLocationState({
          status: 'demo',
          position: defaultLocation,
          error: 'Location permission was denied. Demo coordinates are being used for the map view.',
        });
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
        latitude: locationState.position.latitude,
        longitude: locationState.position.longitude,
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
  const hasVerifiedActivity = dashboardMetrics.totalVerifiedWeight > 0;

  return (
    <PortalLayout title="Welcome back" subtitle="Track your recycling journey, discover local collection points, and monitor your environmental impact." isCollector={false}>
      <div className="dashboard-grid">
        <div className="card wide-card">
          <div className="section-header">
            <h2>Impact overview</h2>
            <span className="mini-tag">Verified activity</span>
          </div>
          <div className="stat-grid">
            <div className="stat-box green">
              <strong>{dashboardMetrics.totalSubmissions}</strong>
              <span>Total submissions</span>
            </div>
            <div className="stat-box blue">
              <strong>{dashboardMetrics.totalVerifiedWeight.toFixed(1)} kg</strong>
              <span>Total waste collected</span>
            </div>
            <div className="stat-box navy">
              <strong>{dashboardMetrics.totalEcoPoints}</strong>
              <span>Eco-points</span>
            </div>
            <div className="stat-box green">
              <strong>{dashboardMetrics.co2Avoided.toFixed(1)} kg</strong>
              <span>CO₂ emissions avoided</span>
            </div>
            <div className="stat-box blue">
              <strong>{dashboardMetrics.achievements.length}</strong>
              <span>Achievements</span>
            </div>
            <div className="stat-box navy">
              <strong>{Object.keys(dashboardMetrics.materialBreakdown).length}</strong>
              <span>Material groups</span>
            </div>
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
            <h2>Recent activity</h2>
            <span className="mini-tag">Live updates</span>
          </div>
          {dashboardRecords.length === 0 ? (
            <div className="empty-state">
              <TreePine size={18} />
              <p>You haven&apos;t started your recycling journey yet. Submit your first recyclable item and start making an impact!</p>
            </div>
          ) : (
            <ul className="activity-list">
              {dashboardRecords.slice(0, 5).map((record) => (
                <li key={record.id}><span className={`dot ${record.verificationDecision === 'accepted' ? 'green' : 'navy'}`} /> {record.confirmedMaterial || record.predictedMaterial} • {Number(record.weightKg || 0).toFixed(1)} kg • {record.verificationDecision}</li>
              ))}
            </ul>
          )}
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
            <h2>Map & nearby collection points</h2>
            <span className="mini-tag">Live location</span>
          </div>
          <div className="location-banner">
            <div>
              <strong>Location status:</strong> {locationState.status === 'live' ? 'Live GPS access' : locationState.status === 'loading' ? 'Checking device location...' : 'Demo fallback active'}
            </div>
            {locationState.error && <span className="location-hint">{locationState.error}</span>}
          </div>
          <div className="button-row">
            <button className="primary" onClick={handleLocationRequest}><LocateFixed size={16} /> Use my location</button>
            <button className="secondary" onClick={() => setLocationState({ status: 'demo', position: defaultLocation, error: 'Demo fallback location restored.' })}><Map size={16} /> Reset demo location</button>
          </div>
          <div className="map-filter-row">
            <label>Material filter</label>
            <select value={selectedMaterial} onChange={(e) => setSelectedMaterial(e.target.value)}>
              {materialOptions.map((material) => <option key={material} value={material}>{material}</option>)}
            </select>
          </div>
          <DemoMapPanel userLocation={locationState.position} selectedMaterial={selectedMaterial} />
          <div className="nearest-panel">
            <MapPinned size={16} />
            {nearestCollectionPoint ? `Nearest collection point: ${nearestCollectionPoint.name} — ${formatDistance(nearestCollectionPoint.distanceMetres)} away` : 'No suitable collection point matched this filter.'}
          </div>
        </section>

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
          </div>
          <div className="button-row">
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
      </div>

      <div className="panel-grid three-col">
        <section className="card env-card">
          <div className="section-header">
            <h2>You helped save our environment!</h2>
            <span className="mini-tag">Verified impact</span>
          </div>
          <div className="tree-panel">
            <div className="tree-visual">
              <TreePine size={48} />
            </div>
            <div className="impact-values">
              <strong>{hasVerifiedActivity ? `${dashboardMetrics.totalVerifiedWeight.toFixed(1)} kg recycled` : '0 kg recycled yet'}</strong>
              <span>{hasVerifiedActivity ? `Estimated CO₂e avoided: ${dashboardMetrics.co2Avoided.toFixed(1)} kg` : 'Start your recycling journey and grow your impact tree.'}</span>
            </div>
          </div>
          <div className="progress-strip">
            <div className="progress-fill" style={{ width: `${Math.min(100, (dashboardMetrics.totalVerifiedWeight / 20) * 100)}%` }} />
          </div>
          <div className="achievement-row">
            {dashboardMetrics.achievements.length ? dashboardMetrics.achievements.map((item) => (
              <span key={item} className="achievement-badge"><Award size={14} /> {item}</span>
            )) : <span className="empty-achievement">No achievements yet</span>}
          </div>
        </section>

        <section className="card env-card">
          <div className="section-header">
            <h2>Environmental impact</h2>
            <span className="mini-tag">Material summary</span>
          </div>
          <div className="impact-list">
            {Object.entries(dashboardMetrics.materialBreakdown).length === 0 ? (
              <div className="empty-state compact"><Info size={18} /><p>No verified material totals yet.</p></div>
            ) : Object.entries(dashboardMetrics.materialBreakdown).map(([material, weight]) => (
              <div key={material} className="impact-row">
                <span>{material}</span>
                <strong>{Number(weight).toFixed(1)} kg</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="card env-card">
          <div className="section-header">
            <h2>Learn about our environment</h2>
            <span className="mini-tag">Awareness</span>
          </div>
          <div className="edu-grid">
            {educationCards.map((card) => (
              <div key={card.title} className="education-card">
                <h3>{card.title}</h3>
                <p>{card.description}</p>
                <small>{card.fact}</small>
                <strong>Action:</strong>
                <span>{card.action}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

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
  const [records, setRecords] = useState(() => readDemoRecords());

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
      weightKg: Number(verification.actualWeightKg || 0),
      condition: verification.condition,
      notes: verification.notes,
      verificationDecision: verification.decision,
      source: verification.source,
      createdAt: new Date().toISOString(),
      demo: true,
      status: 'demo-only',
    };

    const updated = [nextRecord, ...records].slice(0, 20);
    localStorage.setItem(localStorageKey, JSON.stringify(updated));
    setRecords(updated);
    window.dispatchEvent(new CustomEvent('jiji-data-refresh'));
  };

  useEffect(() => {
    const sync = () => setRecords(readDemoRecords());
    window.addEventListener('jiji-data-refresh', sync);
    return () => window.removeEventListener('jiji-data-refresh', sync);
  }, []);

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
    <PortalLayout title="Collector dashboard" subtitle="Assess waste, verify actual collection details, and keep demo-only records separate from operational claims." isCollector>
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
              <div>{Number(record.weightKg || 0).toFixed(1)} kg</div>
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
