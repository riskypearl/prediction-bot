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

// ── Admin dashboard ───────────────────────────────────────────

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
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#080810;color:#e8e8f5;font-family:system-ui,sans-serif}
button{font-family:inherit}
</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
const API_KEY = "${apiKey}";

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

const apiFetch = async(path, opts={})=>{
  const res = await fetch(path, {
    ...opts,
    headers:{"Authorization":"Bearer "+API_KEY,"Content-Type":"application/json",...(opts.headers||{})},
  });
  if(!res.ok) throw new Error(res.status+" "+res.statusText);
  return res.json();
};

function useApi(path, deps=[]){
  const[data,setData]=React.useState(null);
  const[loading,setLoading]=React.useState(true);
  const[error,setError]=React.useState(null);
  const[tick,setTick]=React.useState(0);
  const retry=React.useCallback(()=>setTick(t=>t+1),[]);
  React.useEffect(()=>{
    if(!path){setLoading(false);return;}
    let cancelled=false;
    setLoading(true);setError(null);
    apiFetch(path).then(d=>{if(!cancelled){setData(d);setLoading(false);}}).catch(e=>{if(!cancelled){setError(e.message);setLoading(false);}});
    return()=>{cancelled=true;};
  },[path,tick,...deps]);
  return{data,loading,error,retry,setData};
}

function ProgressBar({pct,color=C.purple}){
  return React.createElement("div",{style:{background:C.bg3,borderRadius:99,height:6,overflow:"hidden",width:"100%"}},
    React.createElement("div",{style:{width:Math.min(pct||0,100)+"%",height:"100%",background:color,borderRadius:99,transition:"width 0.3s"}}));
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

// ── Quick Actions ─────────────────────────────────────────────

function QuickActions({onToast, onRefresh}){
  const[loading,setLoading]=React.useState({});
  const run=async(key,path,label)=>{
    setLoading(l=>({...l,[key]:true}));
    try{
      await apiFetch(path,{method:"POST"});
      onToast(label+" — done!");
      onRefresh();
    }catch(e){onToast("Error: "+e.message);}
    setLoading(l=>({...l,[key]:false}));
  };
  const btns=[
    {key:"remind",label:"Send Reminders",icon:"🔔",color:C.amber,path:"/api/admin/remind"},
    {key:"sync",label:"Sync Fixtures",icon:"🔄",color:C.blue,path:"/api/admin/sync"},
    {key:"refresh",label:"Refresh",icon:"↻",color:C.teal,action:()=>{onRefresh();onToast("Dashboard refreshed!");}},
  ];
  return React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8}},
    btns.map(b=>React.createElement("button",{key:b.key,
      onClick:b.action?b.action:()=>run(b.key,b.path,b.label),
      disabled:!!loading[b.key],
      style:{background:C.bg3,border:"0.5px solid "+C.border,borderRadius:10,padding:"10px 8px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:6,opacity:loading[b.key]?0.6:1}},
      React.createElement("span",{style:{fontSize:18}},loading[b.key]?"⟳":b.icon),
      React.createElement("span",{style:{fontSize:12,color:C.text1,fontWeight:500}},b.label))));
}

// ── Competition selector ──────────────────────────────────────

function CompSelector({value,onChange}){
  const opts=[{v:"",l:"Combined"},{v:"Premier League",l:"Premier League"},{v:"World Cup",l:"World Cup"}];
  return React.createElement("div",{style:{display:"flex",gap:6,marginBottom:"1rem"}},
    opts.map(o=>React.createElement("button",{key:o.v,onClick:()=>onChange(o.v),
      style:{padding:"5px 14px",borderRadius:8,border:"0.5px solid "+(value===o.v?C.purple:C.border),
        background:value===o.v?C.purpleDim:C.bg3,color:value===o.v?C.purpleText:C.text2,
        cursor:"pointer",fontSize:12,fontWeight:value===o.v?500:400}},o.l)));
}

// ── Overview ──────────────────────────────────────────────────

function OverviewPage({ovData,onToast,onRefresh}){
  const[comp,setComp]=React.useState("");
  if(!ovData)return React.createElement(Spinner);
  const d=ovData;
  const gw=d.current_gw||{};
  const matches=(gw.matches||[]).filter(m=>!comp||m.competition===comp);

  // Pick stats from by_competition or totals
  const stats = comp && d.by_competition?.[comp] ? d.by_competition[comp] : d;

  return React.createElement("div",null,
    React.createElement(CompSelector,{value:comp,onChange:setComp}),
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10,marginBottom:"1rem"}},
      [{label:"Upcoming",value:stats.upcoming_matches||0,icon:"📅",color:C.blue},
       {label:"Total predictions",value:stats.total_predictions||0,icon:"📝",color:C.purple},
       {label:"Total users",value:stats.unique_users||0,icon:"👥",color:C.teal},
       {label:"Locked matches",value:stats.locked_matches||0,icon:"🔒",color:C.amber},
      ].map(st=>React.createElement("div",{key:st.label,style:s.card},
        React.createElement("div",{style:{fontSize:20,marginBottom:6}},st.icon),
        React.createElement("div",{style:{fontSize:26,fontWeight:500,color:st.color}},st.value),
        React.createElement("div",{style:{fontSize:11,color:C.text3,marginTop:2}},st.label)))),
    React.createElement("div",{style:{...s.card,marginBottom:"1rem"}},
      React.createElement("div",{style:s.sectionTitle},"Quick actions"),
      React.createElement(QuickActions,{onToast,onRefresh})),
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}},
      React.createElement("div",{style:s.card},
        React.createElement("div",{style:s.sectionTitle},"Current GW fixtures — "+(gw.label||"—")),
        matches.length===0
          ?React.createElement("div",{style:{fontSize:12,color:C.text3}},"No upcoming fixtures")
          :matches.slice(0,5).map((f,i,a)=>React.createElement("div",{key:i,style:{display:"flex",alignItems:"center",gap:6,padding:"7px 0",borderBottom:i<a.length-1?"0.5px solid "+C.border:"none",fontSize:12}},
              React.createElement("span",{style:{flex:1,textAlign:"right"}},f.home_team),
              React.createElement("span",{style:{background:C.bg3,color:C.text3,fontSize:10,padding:"1px 6px",borderRadius:4}},"vs"),
              React.createElement("span",{style:{flex:1}},f.away_team),
              React.createElement("span",{style:{fontSize:10,color:C.text3,minWidth:54,textAlign:"right"}},f.match_date)))),
      React.createElement("div",{style:s.card},
        React.createElement("div",{style:s.sectionTitle},"Last sync"),
        React.createElement("div",{style:{fontSize:13,fontWeight:500,marginBottom:8}},d.last_sync||"Never"),
        React.createElement(Pill,{color:C.greenText,bg:C.greenDim},"football-data.org ✓"))));
}

// ── Users ─────────────────────────────────────────────────────

function UsersPage(){
  const{data,loading,error,retry}=useApi("/api/admin/users");
  const[selected,setSelected]=React.useState(null);
  if(loading)return React.createElement(Spinner);
  if(error)return React.createElement(ErrorBox,{msg:"Failed to load users: "+error,onRetry:retry});
  const users=data?.users||[];
  const u=selected?users.find(x=>x.user_id===selected):null;
  return React.createElement("div",{style:{display:"grid",gridTemplateColumns:selected?"1fr 300px":"1fr",gap:12}},
    React.createElement("div",{style:s.card},
      React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}},
        React.createElement("div",{style:s.sectionTitle},"All users"),
        React.createElement("div",{style:{fontSize:11,color:C.text3}},"click row for detail")),
      React.createElement("div",{style:{overflowX:"auto"}},
        React.createElement("table",{style:{width:"100%",borderCollapse:"collapse",fontSize:12}},
          React.createElement("thead",null,
            React.createElement("tr",null,
              ["#","User","Points","Predictions","Correct","Streak"].map(h=>
                React.createElement("th",{key:h,style:{textAlign:"left",padding:"6px 8px",color:C.text3,fontWeight:500,borderBottom:"0.5px solid "+C.border,whiteSpace:"nowrap"}},h)))),
          React.createElement("tbody",null,
            users.map((u,i)=>React.createElement("tr",{key:u.user_id,
              onClick:()=>setSelected(selected===u.user_id?null:u.user_id),
              style:{cursor:"pointer",background:selected===u.user_id?C.purpleDim:"transparent"},
              onMouseEnter:e=>{if(selected!==u.user_id)e.currentTarget.style.background=C.bg3;},
              onMouseLeave:e=>{if(selected!==u.user_id)e.currentTarget.style.background="transparent";}},
              React.createElement("td",{style:{padding:"8px 8px",color:C.text3}},i+1),
              React.createElement("td",{style:{padding:"8px 8px",fontWeight:500,color:C.text1}},u.username),
              React.createElement("td",{style:{padding:"8px 8px",color:C.purple,fontWeight:500}},u.total_points||0),
              React.createElement("td",{style:{padding:"8px 8px",color:C.text2}},u.predictions_scored||0),
              React.createElement("td",{style:{padding:"8px 8px",color:C.text2}},u.correct_results||0),
              React.createElement("td",{style:{padding:"8px 8px",color:u.current_streak>=3?C.amber:C.text2}},(u.current_streak||0)+(u.current_streak>=3?" 🔥":"")))))))),
    u&&React.createElement("div",{style:{...s.card,alignSelf:"start"}},
      React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}},
        React.createElement("div",null,
          React.createElement("div",{style:{fontSize:15,fontWeight:500}},u.username),
          React.createElement("div",{style:{fontSize:11,color:C.text3}},"Discord ID: "+u.user_id)),
        React.createElement("button",{onClick:()=>setSelected(null),style:{background:"none",border:"none",color:C.text3,cursor:"pointer",fontSize:18}},"×")),
      React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}},
        [{label:"Points",value:u.total_points||0,color:C.purple},
         {label:"Correct",value:u.correct_results||0,color:C.green},
         {label:"Exact scores",value:u.exact_scores||0,color:C.amber},
         {label:"Predictions",value:u.predictions_scored||0,color:C.blue},
         {label:"Current streak",value:(u.current_streak||0)+(u.current_streak>=3?" 🔥":""),color:u.current_streak>=3?C.amber:C.text1},
         {label:"Best streak",value:u.best_streak||0,color:C.teal},
        ].map(m=>React.createElement("div",{key:m.label,style:{background:C.bg3,borderRadius:8,padding:"10px 12px"}},
          React.createElement("div",{style:{fontSize:18,fontWeight:500,color:m.color}},m.value),
          React.createElement("div",{style:{fontSize:11,color:C.text3}},m.label))))));
}

// ── Fixtures ──────────────────────────────────────────────────

function FixturesPage({onToast,onRefresh}){
  const{data,loading,error,retry,setData}=useApi("/api/admin/fixtures");
  const[sel,setSel]=React.useState(null);
  const[locking,setLocking]=React.useState({});

  const toggleLock=async(fix)=>{
    const id=fix.id;
    setLocking(l=>({...l,[id]:true}));
    try{
      const path=fix.locked?"/api/admin/unlock-fixture/"+id:"/api/admin/lock-fixture/"+id;
      await apiFetch(path,{method:"POST"});
      setData(prev=>{
        if(!prev)return prev;
        return {...prev,fixtures:prev.fixtures.map(f=>f.id===id?{...f,locked:fix.locked?0:1}:f)};
      });
      onToast((fix.locked?"Unlocked":"Locked")+": "+fix.home_team+" vs "+fix.away_team);
    }catch(e){onToast("Error: "+e.message);}
    setLocking(l=>({...l,[id]:false}));
  };

  if(loading)return React.createElement(Spinner);
  if(error)return React.createElement(ErrorBox,{msg:"Failed to load fixtures: "+error,onRetry:retry});
  const fixtures=data?.fixtures||[];
  const f=sel!=null?fixtures.find(x=>x.id===sel):null;

  return React.createElement("div",null,
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:10,marginBottom:f?"1rem":0}},
      fixtures.map(fix=>React.createElement("div",{key:fix.id,
        style:{...s.card,cursor:"pointer",border:"0.5px solid "+(sel===fix.id?C.purple:C.border),transition:"border-color 0.15s"}},
        React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}},
          React.createElement("span",{style:{fontSize:10,color:C.text3}},(fix.competition||"")+(fix.gameweek?" · GW"+fix.gameweek:"")),
          React.createElement("div",{style:{display:"flex",gap:6,alignItems:"center"}},
            React.createElement(Pill,{color:fix.locked?C.redText:C.greenText,bg:fix.locked?C.redDim:C.greenDim},fix.locked?"Locked":"Open"),
            React.createElement("button",{
              onClick:e=>{e.stopPropagation();toggleLock(fix);},
              disabled:!!locking[fix.id],
              style:{background:fix.locked?C.greenDim:C.redDim,border:"0.5px solid "+(fix.locked?C.green:C.red),borderRadius:6,color:fix.locked?C.greenText:C.redText,cursor:"pointer",fontSize:10,padding:"2px 7px",fontWeight:500}},
              locking[fix.id]?"...":fix.locked?"Unlock":"Lock"))),
        React.createElement("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6},onClick:()=>setSel(sel===fix.id?null:fix.id)},
          React.createElement("span",{style:{fontWeight:500,fontSize:14}},fix.home_team),
          React.createElement("span",{style:{fontSize:11,color:C.text3}},"vs"),
          React.createElement("span",{style:{fontWeight:500,fontSize:14}},fix.away_team)),
        React.createElement("div",{style:{fontSize:11,color:C.text3,marginBottom: fix.home_score!=null?6:0}},fix.match_date),
        fix.home_score!=null&&React.createElement("div",{style:{fontSize:13,fontWeight:500,color:C.green,textAlign:"center"}},fix.home_score+" – "+fix.away_score)))),
    f&&React.createElement("div",{style:{...s.card,border:"0.5px solid "+C.purple}},
      React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}},
        React.createElement("div",null,
          React.createElement("div",{style:{fontSize:16,fontWeight:500}},f.home_team+" vs "+f.away_team),
          React.createElement("div",{style:{fontSize:11,color:C.text3}},(f.competition||"")+(f.gameweek?" · GW"+f.gameweek:"")+" · "+f.match_date)),
        React.createElement("button",{onClick:()=>setSel(null),style:{background:"none",border:"none",color:C.text3,cursor:"pointer",fontSize:18}},"×")),
      React.createElement("div",{style:{fontSize:13,color:C.text2}},
        f.home_score!=null
          ?React.createElement("span",{style:{color:C.green,fontWeight:500}},"Result: "+f.home_score+" – "+f.away_score)
          :React.createElement("span",{style:{color:C.text3}},"No result yet")),
      React.createElement("div",{style:{marginTop:10,fontSize:12,color:C.text3}},"Match ID: #"+f.id+" · API ID: "+(f.api_id||"manual"))));
}

// ── Leaderboard ───────────────────────────────────────────────

function LeaderboardPage(){
  const[comp,setComp]=React.useState("Premier League");
  const path="/api/admin/leaderboard"+(comp?"?competition="+encodeURIComponent(comp):"");
  const{data,loading,error,retry}=useApi(path,[comp]);
  if(loading)return React.createElement(Spinner);
  if(error)return React.createElement(ErrorBox,{msg:"Failed to load leaderboard: "+error,onRetry:retry});
  const users=data?.leaderboard||[];
  return React.createElement("div",null,
    React.createElement(CompSelector,{value:comp,onChange:setComp}),
    React.createElement("div",{style:s.card},
    React.createElement("div",{style:{...s.sectionTitle,marginBottom:14}},(comp||"Overall")+" leaderboard"),
    users.length===0?React.createElement("div",{style:{fontSize:12,color:C.text3}},"No data yet."):
    users.map((u,i)=>React.createElement("div",{key:i,style:{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:i<users.length-1?"0.5px solid "+C.border:"none"}},
      React.createElement("div",{style:{width:28,height:28,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:500,flexShrink:0,
        background:i===0?C.amberDim:i===1?C.blueDim:C.bg3,
        color:i===0?C.amberText:i===1?C.blueText:C.text3,
        border:"0.5px solid "+(i===0?C.amber:i===1?C.blue:C.border)}},i+1),
      React.createElement("div",{style:{flex:1}},
        React.createElement("div",{style:{fontSize:13,fontWeight:i<3?500:400}},u.username),
        React.createElement("div",{style:{fontSize:11,color:C.text3}},(u.correct_results||0)+" correct · "+(u.predictions_scored||0)+" scored")),
      React.createElement("div",{style:{textAlign:"right"}},
        React.createElement("div",{style:{fontSize:16,fontWeight:500,color:i===0?C.amberText:C.text1}},u.total_points||0),
        React.createElement("div",{style:{fontSize:10,color:C.text3}},"pts"))))));
}

// ── Audit ─────────────────────────────────────────────────────

function AuditPage(){
  const{data,loading,error,retry}=useApi("/api/admin/audit");
  if(loading)return React.createElement(Spinner);
  if(error)return React.createElement(ErrorBox,{msg:"Failed to load audit: "+error,onRetry:retry});
  const entries=data?.audit_log||[];
  return React.createElement("div",{style:s.card},
    React.createElement("div",{style:s.sectionTitle},"Audit log"),
    entries.length===0?React.createElement("div",{style:{fontSize:12,color:C.text3}},"No entries found."):
    entries.map((e,i)=>React.createElement("div",{key:i,style:{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 0",borderBottom:i<entries.length-1?"0.5px solid "+C.border:"none"}},
      React.createElement("span",{style:{fontSize:11,color:C.text3,minWidth:80,paddingTop:1,whiteSpace:"nowrap"}},e.changed_at?new Date(e.changed_at).toLocaleTimeString():"—"),
      React.createElement("div",{style:{flex:1}},
        React.createElement("div",{style:{fontSize:12,color:C.text1}},e.home_team&&e.away_team?e.home_team+" vs "+e.away_team+" ("+e.new_home_score+"-"+e.new_away_score+")":"—"),
        React.createElement("div",{style:{fontSize:11,color:C.text3}},e.username+(e.old_home_score!=null?" · was "+e.old_home_score+"-"+e.old_away_score:" · new prediction"))))));
}

// ── Settings ──────────────────────────────────────────────────

function SettingsPage(){
  const{data,loading,error,retry}=useApi("/api/admin/settings");
  const[local,setLocal]=React.useState(null);
  const[saving,setSaving]=React.useState(false);
  const[saved,setSaved]=React.useState(false);
  React.useEffect(()=>{if(data)setLocal(data);},[data]);
  if(loading)return React.createElement(Spinner);
  if(error)return React.createElement(ErrorBox,{msg:"Failed to load settings: "+error,onRetry:retry});
  const st=local||{};

  const save=async()=>{
    setSaving(true);
    try{
      await apiFetch("/api/admin/settings",{method:"PATCH",body:JSON.stringify({
        reminder_window:st.reminder_window,
        remindmissing_dms:String(!!st.remindmissing_dms),
        reveal_predictions:st.reveal_predictions,
      })});
      setSaved(true);setTimeout(()=>setSaved(false),2000);
    }catch(e){alert("Save failed: "+e.message);}
    setSaving(false);
  };

  return React.createElement("div",null,
    React.createElement("div",{style:{...s.card,marginBottom:"1rem"}},
      React.createElement("div",{style:s.sectionTitle},"Reminder settings"),
      React.createElement("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",borderBottom:"0.5px solid "+C.border}},
        React.createElement("div",null,
          React.createElement("div",{style:{fontSize:13}},"DM reminders"),
          React.createElement("div",{style:{fontSize:11,color:C.text3}},"remindmissing_dms — DM users missing predictions")),
        React.createElement("div",{onClick:()=>setLocal(p=>({...p,remindmissing_dms:!p.remindmissing_dms})),style:{cursor:"pointer"}},
          React.createElement(Toggle,{value:!!st.remindmissing_dms}))),
      React.createElement("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0"}},
        React.createElement("div",null,
          React.createElement("div",{style:{fontSize:13}},"Reminder window"),
          React.createElement("div",{style:{fontSize:11,color:C.text3}},"Hours before kickoff")),
        React.createElement("div",{style:{display:"flex",gap:6}},
          ["off","1h","3h","6h","12h","24h"].map(h=>React.createElement("button",{key:h,
            onClick:()=>setLocal(p=>({...p,reminder_window:h})),
            style:{padding:"4px 8px",borderRadius:7,border:"0.5px solid "+(st.reminder_window===h?C.purple:C.border),background:st.reminder_window===h?C.purpleDim:C.bg3,color:st.reminder_window===h?C.purpleText:C.text2,cursor:"pointer",fontSize:11}},h))))),
    React.createElement("div",{style:{...s.card,marginBottom:"1rem"}},
      React.createElement("div",{style:s.sectionTitle},"Reveal settings"),
      React.createElement("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0"}},
        React.createElement("div",null,
          React.createElement("div",{style:{fontSize:13}},"Reveal mode"),
          React.createElement("div",{style:{fontSize:11,color:C.text3}},"When predictions are shown to users")),
        React.createElement("div",{style:{display:"flex",gap:6}},
          ["after_lock","after_results","never"].map(m=>React.createElement("button",{key:m,
            onClick:()=>setLocal(p=>({...p,reveal_predictions:m})),
            style:{padding:"4px 8px",borderRadius:7,border:"0.5px solid "+(st.reveal_predictions===m?C.teal:C.border),background:st.reveal_predictions===m?C.tealDim:C.bg3,color:st.reveal_predictions===m?C.tealText:C.text2,cursor:"pointer",fontSize:11,fontFamily:"monospace"}},m))))),
    React.createElement("button",{onClick:save,disabled:saving,style:{background:C.purple,border:"none",borderRadius:8,color:"#fff",padding:"10px 24px",cursor:"pointer",fontSize:13,fontWeight:500,opacity:saving?0.7:1}},
      saved?"✓ Saved!":saving?"Saving...":"Save Settings"));
}

// ── System ────────────────────────────────────────────────────

function SystemPage({ovData,ovError}){
  const{data:settings,loading:sLoad}=useApi("/api/admin/settings");
  const checks=[
    {label:"Bot status",value:"Online",ok:!ovError},
    {label:"Database",value:ovData?"Connected · PostgreSQL":"Unknown",ok:!!ovData},
    {label:"Railway deploy",value:"Active",ok:true},
    {label:"Admin API",value:"Listening on port 3000",ok:true},
  ];
  return React.createElement("div",null,
    React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}},
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
         ["Upcoming matches",(ovData?.upcoming_matches||0),C.text1],
         ["Total predictions",(ovData?.total_predictions||0),C.purpleText],
         ["Reminder window",(settings?.reminder_window||"off"),C.amberText],
         ["DM reminders",(settings?.remindmissing_dms?"Enabled":"Disabled"),settings?.remindmissing_dms?C.greenText:C.redText],
         ["Reveal mode",(settings?.reveal_predictions||"—"),C.tealText],
         ["Last sync",(ovData?.last_sync||"Never"),C.text2],
        ].map(([k,v,col])=>React.createElement("div",{key:k,style:{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"0.5px solid "+C.border,fontSize:12}},
          React.createElement("span",{style:{color:C.text3}},k),
          React.createElement("span",{style:{color:col,fontWeight:500}},v))))));
}

// ── App shell ─────────────────────────────────────────────────

function App(){
  const[page,setPage]=React.useState("overview");
  const[sidebarOpen,setSidebarOpen]=React.useState(true);
  const[toast,setToast]=React.useState(null);
  const[refreshTick,setRefreshTick]=React.useState(0);
  const{data:ovData,loading:ovLoading,error:ovError}=useApi("/api/admin/overview",[refreshTick]);
  const onToast=(msg)=>{setToast(msg);setTimeout(()=>setToast(null),3000);};
  const onRefresh=()=>setRefreshTick(t=>t+1);
  const PAGE_TITLES={overview:"Overview",users:"Users",fixtures:"Fixtures",leaderboard:"Leaderboard",audit:"Audit Log",settings:"Settings",system:"System"};

  return React.createElement("div",{style:{display:"flex",background:C.bg0,minHeight:"100vh",color:C.text1,fontFamily:"system-ui,sans-serif"}},
    React.createElement("div",{style:{width:sidebarOpen?200:52,flexShrink:0,background:C.bg1,borderRight:"0.5px solid "+C.border,display:"flex",flexDirection:"column",transition:"width 0.2s",overflow:"hidden"}},
      React.createElement("div",{style:{padding:"14px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"0.5px solid "+C.border,minHeight:52}},
        sidebarOpen&&React.createElement("div",{style:{fontSize:13,fontWeight:500,color:C.purpleText,whiteSpace:"nowrap"}},"⚽ Prediction Bot"),
        React.createElement("button",{onClick:()=>setSidebarOpen(o=>!o),style:{background:"none",border:"none",color:C.text3,cursor:"pointer",fontSize:16,lineHeight:1,marginLeft:"auto",padding:0}},sidebarOpen?"◂":"▸")),
      React.createElement("nav",{style:{flex:1,padding:"8px 0"}},
        NAV_ITEMS.map(item=>React.createElement("button",{key:item.id,onClick:()=>setPage(item.id),
          style:{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:page===item.id?C.purpleDim:"none",border:"none",borderLeft:"2px solid "+(page===item.id?C.purple:"transparent"),color:page===item.id?C.purpleText:C.text2,cursor:"pointer",fontSize:13,fontWeight:page===item.id?500:400,textAlign:"left",whiteSpace:"nowrap"}},
          React.createElement("span",{style:{fontSize:16,flexShrink:0}},item.icon),
          sidebarOpen&&React.createElement("span",null,item.label)))),
      sidebarOpen&&React.createElement("div",{style:{padding:"12px 14px",borderTop:"0.5px solid "+C.border,fontSize:10,color:C.text3}},"v1.3 · live")),
    React.createElement("div",{style:{flex:1,overflow:"auto",minWidth:0}},
      React.createElement("div",{style:{padding:"1rem 1.25rem",borderBottom:"0.5px solid "+C.border,display:"flex",alignItems:"center",justifyContent:"space-between",background:C.bg1}},
        React.createElement("div",{style:{fontSize:16,fontWeight:500}},PAGE_TITLES[page]),
        React.createElement("div",{style:{display:"flex",alignItems:"center",gap:8}},
          ovLoading
            ?React.createElement("span",{style:{fontSize:12,color:C.text3}},"connecting...")
            :React.createElement(React.Fragment,null,
                React.createElement("span",{style:{width:7,height:7,borderRadius:"50%",background:ovError?C.red:C.green,display:"inline-block"}}),
                React.createElement("span",{style:{fontSize:12,color:ovError?C.red:C.green}},ovError?"error":"online")),
          ovData?.current_gw?.label&&React.createElement(React.Fragment,null,
            React.createElement("span",{style:{color:C.border,marginLeft:4,marginRight:4}},"|"),
            React.createElement("span",{style:{fontSize:12,color:C.text3}},ovData.current_gw.label)),
          React.createElement("button",{onClick:onRefresh,title:"Refresh all data",style:{background:"none",border:"0.5px solid "+C.border,borderRadius:6,color:C.text3,cursor:"pointer",fontSize:14,padding:"2px 8px",marginLeft:6,lineHeight:1}},"↻"))),
      React.createElement("div",{style:{padding:"1.25rem"}},
        page==="overview"&&React.createElement(OverviewPage,{ovData,onToast,onRefresh}),
        page==="users"&&React.createElement(UsersPage),
        page==="fixtures"&&React.createElement(FixturesPage,{onToast,onRefresh}),
        page==="leaderboard"&&React.createElement(LeaderboardPage),
        page==="audit"&&React.createElement(AuditPage),
        page==="settings"&&React.createElement(SettingsPage),
        page==="system"&&React.createElement(SystemPage,{ovData,ovError}))),
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
    const { competition } = req.query; // optional: 'Premier League', 'World Cup', or omit for combined

    let upcoming, locked, predictions, users;

    if (competition) {
      const stats = await db.getCompetitionStats(competition);
      upcoming    = { c: stats.upcoming_matches };
      locked      = { c: stats.locked_matches };
      predictions = { c: stats.total_predictions };
      users       = { c: stats.unique_users };
    } else {
      [upcoming, locked, predictions, users] = await Promise.all([
        db.queryOne(`SELECT COUNT(*) as c FROM matches WHERE home_score IS NULL AND locked = 0`),
        db.queryOne(`SELECT COUNT(*) as c FROM matches WHERE locked = 1`),
        db.queryOne(`SELECT COUNT(*) as c FROM predictions`),
        db.queryOne(`SELECT COUNT(DISTINCT user_id) as c FROM predictions`),
      ]);
    }

    const lastSync = await db.getSetting('last_sync');
    const { matches: gwMatches, label: gwLabel } = await db.getCurrentGWMatches();

    // Per-competition stats always included for dashboard toggle
    const [plStats, wcStats] = await Promise.all([
      db.getCompetitionStats('Premier League'),
      db.getCompetitionStats('World Cup'),
    ]);

    res.json({
      upcoming_matches:  parseInt(upcoming?.c  ?? 0),
      locked_matches:    parseInt(locked?.c    ?? 0),
      total_predictions: parseInt(predictions?.c ?? 0),
      unique_users:      parseInt(users?.c      ?? 0),
      last_sync:         lastSync ?? null,
      by_competition: { 'Premier League': plStats, 'World Cup': wcStats },
      current_gw: {
        label:       gwLabel || null,
        match_count: gwMatches.length,
        matches:     gwMatches.map(m => ({
          id: m.id, home_team: m.home_team, away_team: m.away_team,
          match_date: m.match_date, kickoff_ts: m.kickoff_ts,
          competition: m.competition,
        })),
      },
    });
  } catch (err) {
    console.error('API /overview error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /api/admin/users ──────────────────────────────────────

app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await db.query(
      `SELECT user_id, username, total_points, exact_scores, correct_results,
              close_scores, current_streak, best_streak, predictions_scored
       FROM user_stats ORDER BY total_points DESC, exact_scores DESC`
    );
    res.json({ users });
  } catch (err) {
    console.error('API /users error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /api/admin/fixtures ───────────────────────────────────

app.get('/api/admin/fixtures', async (req, res) => {
  try {
    const fixtures = await db.query(
      `SELECT * FROM matches ORDER BY match_date DESC LIMIT 50`
    );
    res.json({ fixtures });
  } catch (err) {
    console.error('API /fixtures error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST /api/admin/lock-fixture/:id ─────────────────────────

app.post('/api/admin/lock-fixture/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const match = await db.getMatch(id);
    if (!match) return res.status(404).json({ error: 'Match not found.' });
    await db.lockMatch(id);
    console.log(`🔒 Admin locked match #${id}`);
    res.json({ success: true, id, locked: true });
  } catch (err) {
    console.error('API /lock-fixture error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST /api/admin/unlock-fixture/:id ───────────────────────

app.post('/api/admin/unlock-fixture/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const match = await db.getMatch(id);
    if (!match) return res.status(404).json({ error: 'Match not found.' });
    await db.unlockMatch(id);
    console.log(`🔓 Admin unlocked match #${id}`);
    res.json({ success: true, id, locked: false });
  } catch (err) {
    console.error('API /unlock-fixture error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST /api/admin/sync ──────────────────────────────────────

app.post('/api/admin/sync', async (req, res) => {
  try {
    const api = require('./football-api');
    const results = await api.syncAll();
    await db.setSetting('last_sync', new Date().toUTCString());
    console.log('🔄 Admin triggered sync');
    res.json({ success: true, results });
  } catch (err) {
    console.error('API /sync error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST /api/admin/remind ────────────────────────────────────

app.post('/api/admin/remind', async (req, res) => {
  try {
    const { matches, label } = await db.getCurrentGWMatches();
    if (matches.length === 0) return res.json({ success: true, sent: 0, message: 'No open fixtures.' });
    const matchIds = matches.map(m => m.id);
    const allUsers = await db.query(`SELECT DISTINCT user_id, username FROM predictions ORDER BY username ASC`);
    const missing = [];
    for (const user of allUsers) {
      const rows = await db.query(
        `SELECT COUNT(*) as c FROM predictions WHERE user_id = $1 AND match_id = ANY($2::int[])`,
        [user.user_id, matchIds]
      );
      const predicted = parseInt(rows[0]?.c ?? 0);
      if (matchIds.length - predicted > 0) missing.push(user.username);
    }
    console.log(`📬 Admin triggered reminders — ${missing.length} missing for ${label}`);
    res.json({ success: true, sent: missing.length, missing, label });
  } catch (err) {
    console.error('API /remind error:', err);
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

// ── POST /api/admin/setresult ─────────────────────────────────

app.post('/api/admin/setresult', async (req, res) => {
  try {
    const { match_id, home_score, away_score } = req.body;
    if (match_id == null || home_score == null || away_score == null) {
      return res.status(400).json({ error: 'match_id, home_score, away_score required.' });
    }
    const match = await db.getMatch(parseInt(match_id));
    if (!match) return res.status(404).json({ error: 'Match not found.' });
    const count = await db.setResult(parseInt(match_id), parseInt(home_score), parseInt(away_score));
    console.log(`✅ Admin set result for match #${match_id}: ${home_score}–${away_score}`);
    res.json({ success: true, match_id: parseInt(match_id), home_score: parseInt(home_score), away_score: parseInt(away_score), predictions_scored: count });
  } catch (err) {
    console.error('API /setresult error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST /api/admin/addmatch ──────────────────────────────────

app.post('/api/admin/addmatch', async (req, res) => {
  try {
    const { competition, home_team, away_team, match_date, gameweek, kickoff_ts } = req.body;
    if (!competition || !home_team || !away_team || !match_date) {
      return res.status(400).json({ error: 'competition, home_team, away_team, match_date required.' });
    }
    const result = await db.addMatch(competition, home_team, away_team, match_date, gameweek ?? null, kickoff_ts ?? null);
    const match  = await db.getMatch(result.lastInsertRowid);
    console.log(`➕ Admin added match #${match.id}: ${home_team} vs ${away_team}`);
    res.json({ success: true, match });
  } catch (err) {
    console.error('API /addmatch error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /api/admin/missing ────────────────────────────────────
// Returns missing prediction counts per user for current active set
// Query params: competition (optional)

app.get('/api/admin/missing', async (req, res) => {
  try {
    const { matches, label } = await db.getCurrentGWMatches();
    if (matches.length === 0) return res.json({ label: null, missing: [] });
    const matchIds = matches.map(m => m.id);
    const allUsers = await db.query(`SELECT DISTINCT user_id, username FROM predictions ORDER BY username ASC`);
    const missing = [];
    for (const user of allUsers) {
      const rows = await db.query(
        `SELECT COUNT(*) as c FROM predictions WHERE user_id = $1 AND match_id = ANY($2::int[])`,
        [user.user_id, matchIds]
      );
      const predicted = parseInt(rows[0]?.c ?? 0);
      const remaining = matchIds.length - predicted;
      if (remaining > 0) missing.push({ user_id: user.user_id, username: user.username, remaining, total: matchIds.length, predicted });
    }
    res.json({ label, total_matches: matchIds.length, missing });
  } catch (err) {
    console.error('API /missing error:', err);
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