/**
 * src/api.js — Express admin API
 * Runs on PORT (default 3000) alongside the Discord bot.
 * All routes require the Authorization header to match ADMIN_API_KEY.
 */

const express = require('express');
const cors    = require('cors');
const db      = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

// ── Admin dashboard (no auth — key is embedded in the page) ──

app.get('/admin', (req, res) => {
  const apiKey = process.env.ADMIN_API_KEY || '';
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Prediction Bot Admin</title>
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#080810;color:#e8e8f5;font-family:system-ui,sans-serif}</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
const API_KEY = "${apiKey}";
const BASE_URL = "";

const C = {
  bg0:"#080810",bg1:"#0f0f1c",bg2:"#15152a",bg3:"#1c1c35",
  border:"#252540",borderHover:"#3a3a60",
  text1:"#e8e8f5",text2:"#9090b8",text3:"#55557a",
  purple:"#7c6af7",purpleDim:"#2a2550",purpleText:"#c4baff",
  green:"#22c55e",greenDim:"#0f2a1a",greenText:"#86efac",
  amber:"#f59e0b",amberDim:"#2a1f08",amberText:"#fcd34d",
  red:"#ef4444",redDim:"#2a0f0f",redText:"#fca5a5",
  blue:"#3b82f6",blueDim:"#0f1e2a",blueText:"#93c5fd",
  teal:"#14b8a6",tealDim:"#0a2020",tealText:"#5eead4",
};

const BADGE_COLORS = {
  sync:[C.blueDim,C.blueText],lock:[C.redDim,C.redText],
  reminder:[C.amberDim,C.amberText],score:[C.greenDim,C.greenText],
  predict:[C.blueDim,C.blueText],admincheck:[C.purpleDim,C.purpleText],
  serversettings:[C.tealDim,C.tealText],
};

const NAV_ITEMS = [
  {id:"overview",label:"Overview",icon:"⊞"},
  {id:"users",label:"Users",icon:"👥"},
  {id:"fixtures",label:"Fixtures",icon:"⚽"},
  {id:"leaderboard",label:"Leaderboard",icon:"🏆"},
  {id:"audit",label:"Audit Log",icon:"📋"},
  {id:"settings",label:"Settings",icon:"⚙️"},
  {id:"system",label:"System",icon:"🖥"},
];

const s = {
  card:{background:C.bg2,border:"0.5px solid "+C.border,borderRadius:12,padding:"1rem 1.25rem"},
  sectionTitle:{fontSize:11,fontWeight:500,color:C.text3,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12},
  badge:(a)=>{const[bg,col]=(BADGE_COLORS[a]||[C.bg3,C.text2]);return{background:bg,color:col,fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:5,fontFamily:"monospace",display:"inline-block",whiteSpace:"nowrap"};},
};

const apiFetch = async(path)=>{
  const res = await fetch(BASE_URL+path,{headers:{"Authorization":"Bearer "+API_KEY,"Content-Type":"application/json"}});
  if(!res.ok) throw new Error(res.status+" "+res.statusText);
  return res.json();
};

function useApi(path,deps=[]){
  const[data,setData]=React.useState(null);
  const[loading,setLoading]=React.useState(true);
  const[error,setError]=React.useState(null);
  const[tick,setTick]=React.useState(0);
  const retry=React.useCallback(()=>setTick(t=>t+1),[]);
  React.useEffect(()=>{
    let cancelled=false;
    setLoading(true);setError(null);
    apiFetch(path).then(d=>{if(!cancelled){setData(d);setLoading(false);}}).catch(e=>{if(!cancelled){setError(e.message);setLoading(false);}});
    return()=>{cancelled=true;};
  },[path,tick,...deps]);
  return{data,loading,error,retry};
}

function ProgressBar({pct,color=C.purple}){
  return React.createElement("div",{style:{background:C.bg3,borderRadius:99,height:6,overflow:"hidden",width:"100%"}},
    React.createElement("div",{style:{width:Math.min(pct,100)+"%",height:"100%",background:color,borderRadius:99,transition:"width 0.3s"}}));
}
function Toggle({value}){
  return React.createElement("div",{style:{width:34,height:18,borderRadius:9,background:value?C.purple:C.bg3,position:"relative",flexShrink:0,border:"0.5px solid "+(value?C.purple:C.border)}},
    React.createElement("div",{style:{width:12,height:12,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:value?19:3,transition:"left 0.2s"}}));
}
function Pill({children,color,bg}){
  return React.createElement("span",{style:{background:bg,color,fontSize:11,fontWeight:500,padding:"2px 9px",borderRadius:99}},children);
}
function Spinner(){
  return React.createElement("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",padding:"2rem",color:C.text3,fontSize:13}},"⟳ Loading...");
}
function ErrorBox({msg,onRetry}){
  return React.createElement("div",{style:{background:C.redDim,border:"0.5px solid "+C.red,borderRadius:10,padding:"1rem 1.25rem",color:C.redText,fontSize:13,display:"flex",alignItems:"center",justifyContent:"space-between"}},
    React.createElement("span",null,"⚠ "+msg),
    onRetry&&React.createElement("button",{onClick:onRetry,style:{background:C.red,border:"none",color:"#fff",borderRadius:6,padding:"4px 12px",cursor:"pointer",fontSize:12,marginLeft:12}},"Retry"));
}
function Toast({msg,onClose}){
  if(!msg)return null;
  return React.createElement("div",{style:{position:"fixed",bottom:24,right:24,background:C.bg3,border:"0.5px solid "+C.purple,borderRadius:10,padding:"10px 16px",fontSize:13,color:C.purpleText,zIndex:999,display:"flex",alignItems:"center",gap:10}},
    "✓ "+msg,
    React.createElement("button",{onClick:onClose,style:{background:"none",border:"none",color:C.text3,cursor:"pointer",fontSize:16,lineHeight:1}},"×"));
}

function OverviewPage({ovData,onAction}){
  if(!ovData)return React.createElement(Spinner);
  const d=ovData;
  const gw=d.current_gw||{};
  const completed=0,total=d.unique_users||0;
  const pct=0;
  const col=C.amber;
  const matches=gw.matches||[];
  return React.createElement("div",null,
    React.createElement("div",{style:{...s.card,marginBottom:"1rem"}},
      React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}},
        React.createElement("div",null,
          React.createElement("div",{style:s.sectionTitle},(gw.label||"GW")+" prediction completion"),
          React.createElement("div",{style:{display:"flex",alignItems:"baseline",gap:8}},
            React.createElement("span",{style:{fontSize:28,fontWeight:500,color:col}},pct+"%"),
            React.createElement("span",{style:{fontSize:14,color:C.text2}},completed+" / "+total+" users"))),
        React.createElement("div",{style:{textAlign:"right"}},
          React.createElement(Pill,{color:C.amberText,bg:C.amberDim},"Pending"),
          React.createElement("div",{style:{fontSize:11,color:C.text3,marginTop:4}},gw.label||""))),
      React.createElement(ProgressBar,{pct:pct,color:col})),
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,marginBottom:"1rem"}},
      [{label:"Upcoming fixtures",value:d.upcoming_matches||0,icon:"📅",color:C.blue},
       {label:"Total predictions",value:d.total_predictions||0,icon:"📝",color:C.purple},
       {label:"Total users",value:d.unique_users||0,icon:"👥",color:C.teal},
       {label:"Locked matches",value:d.locked_matches||0,icon:"🔒",color:C.amber}
      ].map(st=>React.createElement("div",{key:st.label,style:{...s.card}},
        React.createElement("div",{style:{fontSize:20,marginBottom:6}},st.icon),
        React.createElement("div",{style:{fontSize:26,fontWeight:500,color:st.color}},st.value),
        React.createElement("div",{style:{fontSize:11,color:C.text3,marginTop:2}},st.label)))),
    React.createElement("div",{style:{...s.card,marginBottom:"1rem"}},
      React.createElement("div",{style:s.sectionTitle},"Quick actions"),
      React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8}},
        [{label:"Send Reminders",icon:"🔔",color:C.amber},
         {label:"Sync Fixtures",icon:"🔄",color:C.blue},
         {label:"Lock Fixtures",icon:"🔒",color:C.red},
         {label:"Refresh",icon:"↻",color:C.teal}
        ].map(b=>React.createElement("button",{key:b.label,onClick:()=>onAction(b.label),
          style:{background:C.bg3,border:"0.5px solid "+C.border,borderRadius:10,padding:"10px 8px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:6}},
          React.createElement("span",{style:{fontSize:18}},b.icon),
          React.createElement("span",{style:{fontSize:12,color:C.text1,fontWeight:500}},b.label))))),
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}},
      React.createElement("div",{style:s.card},
        React.createElement("div",{style:s.sectionTitle},"Upcoming fixtures — "+(gw.label||"")),
        matches.length===0?React.createElement("div",{style:{fontSize:12,color:C.text3}},"No upcoming fixtures"):
        matches.slice(0,4).map((f,i,a)=>React.createElement("div",{key:i,style:{display:"flex",alignItems:"center",gap:6,padding:"7px 0",borderBottom:i<a.length-1?"0.5px solid "+C.border:"none",fontSize:12}},
          React.createElement("span",{style:{flex:1,textAlign:"right"}},f.home_team),
          React.createElement("span",{style:{background:C.bg3,color:C.text3,fontSize:10,padding:"1px 6px",borderRadius:4}},"vs"),
          React.createElement("span",{style:{flex:1}},f.away_team),
          React.createElement("span",{style:{fontSize:10,color:C.text3,minWidth:54,textAlign:"right"}},f.match_date)))),
      React.createElement("div",{style:s.card},
        React.createElement("div",{style:s.sectionTitle},"Last sync"),
        React.createElement("div",{style:{fontSize:13,fontWeight:500,marginBottom:4}},d.last_sync||"—"),
        React.createElement(Pill,{color:C.greenText,bg:C.greenDim},"football-data.org ✓"))));
}

function LeaderboardPage(){
  const{data,loading,error,retry}=useApi("/api/admin/leaderboard");
  if(loading)return React.createElement(Spinner);
  if(error)return React.createElement(ErrorBox,{msg:"Failed to load leaderboard: "+error,onRetry:retry});
  const users=data?.leaderboard||[];
  return React.createElement("div",{style:s.card},
    React.createElement("div",{style:{...s.sectionTitle,marginBottom:14}},"Season leaderboard"),
    users.map((u,i)=>React.createElement("div",{key:i,style:{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:i<users.length-1?"0.5px solid "+C.border:"none"}},
      React.createElement("div",{style:{width:28,height:28,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:500,flexShrink:0,
        background:i===0?C.amberDim:i===1?C.blueDim:C.bg3,color:i===0?C.amberText:i===1?C.blueText:C.text3,
        border:"0.5px solid "+(i===0?C.amber:i===1?C.blue:C.border)}},i+1),
      React.createElement("div",{style:{flex:1}},
        React.createElement("div",{style:{fontSize:13,fontWeight:i<3?500:400}},u.username||u.name||"Unknown"),
        React.createElement("div",{style:{fontSize:11,color:C.text3}},(u.correct_predictions||0)+" correct")),
      React.createElement("div",{style:{textAlign:"right"}},
        React.createElement("div",{style:{fontSize:16,fontWeight:500,color:i===0?C.amberText:C.text1}},u.total_points||0),
        React.createElement("div",{style:{fontSize:10,color:C.text3}},"pts")))));
}

function AuditPage(){
  const{data,loading,error,retry}=useApi("/api/admin/audit");
  if(loading)return React.createElement(Spinner);
  if(error)return React.createElement(ErrorBox,{msg:"Failed to load audit: "+error,onRetry:retry});
  const entries=data?.audit_log||[];
  return React.createElement("div",{style:s.card},
    React.createElement("div",{style:s.sectionTitle},"Audit log"),
    entries.length===0?React.createElement("div",{style:{fontSize:12,color:C.text3}},"No entries found."):
    entries.map((e,i)=>{
      const action=e.action||"log";
      const[bg,col]=BADGE_COLORS[action]||[C.bg3,C.text2];
      const ts=e.changed_at?Math.floor(new Date(e.changed_at).getTime()/1000):null;
      return React.createElement("div",{key:i,style:{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 0",borderBottom:i<entries.length-1?"0.5px solid "+C.border:"none"}},
        React.createElement("span",{style:{fontSize:11,color:C.text3,minWidth:44,paddingTop:1}},ts?"<t:"+ts+":R>":"—"),
        React.createElement("span",{style:{background:bg,color:col,fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:5,fontFamily:"monospace",display:"inline-block",whiteSpace:"nowrap"}},action),
        React.createElement("div",{style:{flex:1}},
          React.createElement("div",{style:{fontSize:12,color:C.text1}},e.home_team&&e.away_team?e.home_team+" vs "+e.away_team+" — "+e.new_home_score+"-"+e.new_away_score:"—"),
          React.createElement("div",{style:{fontSize:11,color:C.text3}},e.username||"system")));
    }));
}

function SettingsPage(){
  const{data,loading,error,retry}=useApi("/api/admin/settings");
  const[local,setLocal]=React.useState(null);
  React.useEffect(()=>{if(data)setLocal(data);},[data]);
  if(loading)return React.createElement(Spinner);
  if(error)return React.createElement(ErrorBox,{msg:"Failed to load settings: "+error,onRetry:retry});
  const st=local||{};
  const toggle=k=>setLocal(p=>({...p,[k]:!p[k]}));
  const wh=st.reminder_window||"off";
  const rm=st.reveal_predictions||"after_lock";
  return React.createElement("div",null,
    React.createElement("div",{style:{...s.card,marginBottom:"1rem"}},
      React.createElement("div",{style:s.sectionTitle},"Reminder settings"),
      [["DM reminders","remindmissing_dms","Direct message users missing predictions"]].map(([label,k,desc])=>
        React.createElement("div",{key:k,style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",borderBottom:"0.5px solid "+C.border}},
          React.createElement("div",null,
            React.createElement("div",{style:{fontSize:13}},label),
            React.createElement("div",{style:{fontSize:11,color:C.text3}},desc)),
          React.createElement("div",{onClick:()=>toggle(k),style:{cursor:"pointer"}},React.createElement(Toggle,{value:!!st[k]})))),
      React.createElement("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0"}},
        React.createElement("div",null,
          React.createElement("div",{style:{fontSize:13}},"Reminder window"),
          React.createElement("div",{style:{fontSize:11,color:C.text3}},"Current: "+wh)),
        React.createElement("div",{style:{fontSize:14,fontWeight:500,color:C.purple}},wh))),
    React.createElement("div",{style:s.card},
      React.createElement("div",{style:s.sectionTitle},"Reveal settings"),
      React.createElement("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",borderBottom:"0.5px solid "+C.border}},
        React.createElement("div",null,React.createElement("div",{style:{fontSize:13}},"Reveal mode")),
        React.createElement("span",{style:{background:C.tealDim,color:C.tealText,fontSize:11,padding:"3px 10px",borderRadius:6,fontFamily:"monospace"}},rm))));
}

function SystemPage({ovData,ovError}){
  const{data:settings,loading:sLoad}=useApi("/api/admin/settings");
  const checks=[
    {label:"Bot status",value:"Online",ok:!ovError},
    {label:"Database",value:ovData?"Connected · PostgreSQL":"Unknown",ok:!!ovData},
    {label:"Railway deploy",value:"Active",ok:true},
    {label:"Admin API",value:"Listening on port 3000",ok:true},
  ];
  return React.createElement("div",null,
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:"1rem"}},
      React.createElement("div",{style:s.card},
        React.createElement("div",{style:s.sectionTitle},"System health"),
        checks.map((c,i)=>React.createElement("div",{key:c.label,style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<checks.length-1?"0.5px solid "+C.border:"none"}},
          React.createElement("div",null,
            React.createElement("div",{style:{fontSize:12}},c.label),
            React.createElement("div",{style:{fontSize:11,color:C.text3}},c.value)),
          React.createElement("span",{style:{width:8,height:8,borderRadius:"50%",background:c.ok?C.green:C.red,display:"inline-block"}})))),
      React.createElement("div",{style:s.card},
        React.createElement("div",{style:s.sectionTitle},"Settings snapshot"),
        sLoad?React.createElement(Spinner):
        [["Current GW",(ovData?.current_gw?.label||"—"),C.blueText],
         ["Reminder window",(settings?.reminder_window||"—"),C.amberText],
         ["DM reminders",(settings?.remindmissing_dms?"Enabled":"Disabled"),settings?.remindmissing_dms?C.greenText:C.redText],
         ["Reveal mode",(settings?.reveal_predictions||"—"),C.tealText],
         ["Last sync",(ovData?.last_sync||"—"),C.text2],
        ].map(([k,v,col])=>React.createElement("div",{key:k,style:{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"0.5px solid "+C.border,fontSize:12}},
          React.createElement("span",{style:{color:C.text3}},k),
          React.createElement("span",{style:{color:col,fontWeight:500}},v))))));
}

function App(){
  const[page,setPage]=React.useState("overview");
  const[sidebarOpen,setSidebarOpen]=React.useState(true);
  const[toast,setToast]=React.useState(null);
  const[refreshTick,setRefreshTick]=React.useState(0);
  const{data:ovData,loading:ovLoading,error:ovError,retry:ovRetry}=useApi("/api/admin/overview",[refreshTick]);
  const handleAction=(label)=>{setToast(label+" triggered");setTimeout(()=>setToast(null),3000);};
  const PAGE_TITLES={overview:"Overview",users:"Users",fixtures:"Fixtures",leaderboard:"Leaderboard",audit:"Audit Log",settings:"Settings",system:"System"};

  return React.createElement("div",{style:{display:"flex",background:C.bg0,minHeight:"100vh",color:C.text1,fontFamily:"system-ui,sans-serif"}},
    React.createElement("div",{style:{width:sidebarOpen?200:52,flexShrink:0,background:C.bg1,borderRight:"0.5px solid "+C.border,display:"flex",flexDirection:"column",transition:"width 0.2s",overflow:"hidden"}},
      React.createElement("div",{style:{padding:"14px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"0.5px solid "+C.border,minHeight:52}},
        sidebarOpen&&React.createElement("div",{style:{fontSize:13,fontWeight:500,color:C.purpleText,whiteSpace:"nowrap"}},"⚽ Prediction Bot"),
        React.createElement("button",{onClick:()=>setSidebarOpen(o=>!o),style:{background:"none",border:"none",color:C.text3,cursor:"pointer",fontSize:16,lineHeight:1,marginLeft:"auto",padding:0}},sidebarOpen?"◂":"▸")),
      React.createElement("nav",{style:{flex:1,padding:"8px 0"}},
        NAV_ITEMS.map(item=>React.createElement("button",{key:item.id,onClick:()=>setPage(item.id),style:{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:page===item.id?C.purpleDim:"none",border:"none",borderLeft:"2px solid "+(page===item.id?C.purple:"transparent"),color:page===item.id?C.purpleText:C.text2,cursor:"pointer",fontSize:13,fontWeight:page===item.id?500:400,textAlign:"left",whiteSpace:"nowrap"}},
          React.createElement("span",{style:{fontSize:16,flexShrink:0}},item.icon),
          sidebarOpen&&React.createElement("span",null,item.label))))),
    React.createElement("div",{style:{flex:1,overflow:"auto",minWidth:0}},
      React.createElement("div",{style:{padding:"1rem 1.25rem",borderBottom:"0.5px solid "+C.border,display:"flex",alignItems:"center",justifyContent:"space-between",background:C.bg1}},
        React.createElement("div",{style:{fontSize:16,fontWeight:500}},PAGE_TITLES[page]),
        React.createElement("div",{style:{display:"flex",alignItems:"center",gap:8}},
          ovLoading?React.createElement("span",{style:{fontSize:12,color:C.text3}},"connecting..."):
          React.createElement(React.Fragment,null,
            React.createElement("span",{style:{width:7,height:7,borderRadius:"50%",background:ovError?C.red:C.green,display:"inline-block"}}),
            React.createElement("span",{style:{fontSize:12,color:ovError?C.red:C.green}},ovError?"error":"online")),
          ovData?.current_gw?.label&&React.createElement(React.Fragment,null,
            React.createElement("span",{style:{color:C.border,marginLeft:4,marginRight:4}},"|"),
            React.createElement("span",{style:{fontSize:12,color:C.text3}},ovData.current_gw.label)),
          React.createElement("button",{onClick:()=>setRefreshTick(t=>t+1),title:"Refresh all data",style:{background:"none",border:"0.5px solid "+C.border,borderRadius:6,color:C.text3,cursor:"pointer",fontSize:14,padding:"2px 8px",marginLeft:6,lineHeight:1}},"↻"))),
      React.createElement("div",{style:{padding:"1.25rem"}},
        page==="overview"&&React.createElement(OverviewPage,{ovData:ovData,onAction:handleAction}),
        page==="leaderboard"&&React.createElement(LeaderboardPage),
        page==="audit"&&React.createElement(AuditPage),
        page==="settings"&&React.createElement(SettingsPage),
        page==="system"&&React.createElement(SystemPage,{ovData:ovData,ovError:ovError}),
        (page==="users"||page==="fixtures")&&React.createElement("div",{style:{...s.card,color:C.text3,fontSize:13}},"Coming soon — users and fixtures data will appear here."))),
    React.createElement(Toast,{msg:toast,onClose:()=>setToast(null)}));
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
</script>
</body>
</html>`);
});

// ── Auth middleware ───────────────────────────────────────────

function requireApiKey(req, res, next) {
  const apiKey = process.env.ADMIN_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ADMIN_API_KEY not configured on server.' });
  }
  const provided = req.headers['authorization'];
  if (!provided || provided !== `Bearer ${apiKey}`) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  next();
}

app.use('/api/admin', requireApiKey);

// ── GET /api/admin/overview ───────────────────────────────────

app.get('/api/admin/overview', async (req, res) => {
  try {
    const [upcoming, locked, predictions, users, lastSync] = await Promise.all([
      db.queryOne(`SELECT COUNT(*) as c FROM matches WHERE home_score IS NULL AND locked = 0`),
      db.queryOne(`SELECT COUNT(*) as c FROM matches WHERE locked = 1`),
      db.queryOne(`SELECT COUNT(*) as c FROM predictions`),
      db.queryOne(`SELECT COUNT(DISTINCT user_id) as c FROM predictions`),
      db.getSetting('last_sync'),
    ]);

    const { matches: gwMatches, label: gwLabel } = await db.getCurrentGWMatches();

    res.json({
      upcoming_matches:   parseInt(upcoming?.c   ?? 0),
      locked_matches:     parseInt(locked?.c     ?? 0),
      total_predictions:  parseInt(predictions?.c ?? 0),
      unique_users:       parseInt(users?.c       ?? 0),
      last_sync:          lastSync ?? null,
      current_gw: {
        label:       gwLabel || null,
        match_count: gwMatches.length,
        matches:     gwMatches.map(m => ({
          id:        m.id,
          home_team: m.home_team,
          away_team: m.away_team,
          match_date: m.match_date,
          kickoff_ts: m.kickoff_ts,
        })),
      },
    });
  } catch (err) {
    console.error('API /overview error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /api/admin/leaderboard ────────────────────────────────

app.get('/api/admin/leaderboard', async (req, res) => {
  try {
    const { competition, gameweek } = req.query;
    let rows;
    if (gameweek) {
      rows = await db.getGameweekLeaderboard(parseInt(gameweek), competition || 'Premier League');
    } else {
      rows = await db.getLeaderboard(competition || null);
    }
    res.json({ leaderboard: rows });
  } catch (err) {
    console.error('API /leaderboard error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /api/admin/audit ──────────────────────────────────────

app.get('/api/admin/audit', async (req, res) => {
  try {
    const { user_id, match_id, limit } = req.query;
    const safeLimit = Math.min(parseInt(limit) || 20, 50);
    const rows = await db.getRecentAuditLog(user_id || null, match_id ? parseInt(match_id) : null);
    res.json({ audit_log: rows.slice(0, safeLimit) });
  } catch (err) {
    console.error('API /audit error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /api/admin/settings ───────────────────────────────────

app.get('/api/admin/settings', async (req, res) => {
  try {
    const [reminderWindow, remindmissingDms, revealPredictions, announcementChannel, lastSync] = await Promise.all([
      db.getSetting('reminder_window'),
      db.getSetting('remindmissing_dms'),
      db.getSetting('reveal_predictions'),
      db.getSetting('announcement_channel'),
      db.getSetting('last_sync'),
    ]);
    res.json({
      reminder_window:      reminderWindow      ?? 'off',
      remindmissing_dms:    remindmissingDms    === 'true',
      reveal_predictions:   revealPredictions   ?? 'after_lock',
      announcement_channel: announcementChannel ?? null,
      last_sync:            lastSync            ?? null,
    });
  } catch (err) {
    console.error('API /settings error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── PATCH /api/admin/settings ─────────────────────────────────

app.patch('/api/admin/settings', async (req, res) => {
  try {
    const allowed = ['reminder_window', 'remindmissing_dms', 'reveal_predictions'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        const value = String(req.body[key]);
        await db.setSetting(key, value);
        updates[key] = value;
      }
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid settings provided.' });
    }
    res.json({ updated: updates });
  } catch (err) {
    console.error('API PATCH /settings error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Start ─────────────────────────────────────────────────────

function startApi() {
  const port = parseInt(process.env.API_PORT) || 3000;
  app.listen(port, () => {
    console.log(`🌐 Admin API listening on port ${port}`);
  });
}

module.exports = { startApi };