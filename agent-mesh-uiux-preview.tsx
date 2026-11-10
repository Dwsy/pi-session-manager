import React from 'react'
import { createRoot } from 'react-dom/client'
import './src/styles/index.less'
import './src/i18n'
import MeshSidebar from './extensions/psm-mesh/MeshSidebar'
import MeshWorkspace from './extensions/psm-mesh/MeshWorkspace'
import { createMeshStore } from './extensions/psm-mesh/meshStore'
import type { AppPluginSurfaceData } from './src/components/app/AppPluginSurfaceData'
import type { PsmPluginHostContext, PsmMeshPeer } from '@dwsy/plugin-sdk'
const at = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString()
const sessions = Array.from({length:72},(_,i)=>({
 id:`11111111-1111-4111-8111-${String(i+1).padStart(12,'0')}`,
 path:`/Users/demo/.pi/agent/sessions/session-${i}.jsonl`,
 cwd:i<7?['/work/ai/pi-session-manager','/work/company/bw-platform','/work/ai/pi-grok-build'][i%3]:`/work/projects/repository-${i%24}`,
 name:i<7?['Mesh 工作区 UI/UX 细节打磨：完善长标题、消息入口与多窗口体验','快递 API 全链路回归与订单状态验证','工具调用流式展示与代码差异高亮','修复工作区会话搜索体验','Review · 柜机配置推送与错误重试','接入第三方支付通知处理','整理会话元数据和工具输出'][i]:i===8?'Offline invoice debugging':`历史会话 · 业务流程检查 ${i}`,
 created:at(120),modified:at(i+2),message_count:25,first_message:'检查任务实现',last_message:'任务处理中',last_message_role:'assistant'
}))
const peers: PsmMeshPeer[] = sessions.slice(0,7).map((s,i)=>({
 sessionId:s.id,sessionFile:s.path,cwd:s.cwd,pid:i+1,machineId:'isolated-ui-test',
 startedAt:s.created,lastHeartbeat:at(0),state:i===0?'running':'waiting',
 model:i===2?'provider/a-very-long-model-name-that-must-not-overflow-the-session-card':'deepseek-v4.1-flash',
 git:{repoRoot:s.cwd,branch:i===0?'feature/mesh-ui-improvements':'main',commonRoot:s.cwd,worktree:'main'},
 files:[{op:i%2?'write':'edit',path:`${s.cwd}/src/${i===0?'MeshWorkspace.tsx':'SessionController.ts'}`,ts:at(i+1)}],following:[]
}))
const listeners=new Map<string,(event:any)=>void>()
const ctx={i18n:{t:(_key:string,fallback:string)=>fallback},psm:{
 mesh:{peers:async()=>peers,herdrAgents:async()=>peers.slice(0,4).map((p,i)=>({paneId:`w1:p${i+1}`,workspaceId:'w1',sessionPath:p.sessionFile,status:'working'})),
 focus:async()=>({ok:true}),send:async()=>({ok:true}),cancel:async()=>({ok:true})},
 favorites:{list:async()=>[{id:sessions[2].id,path:sessions[2].path,type:'session',name:sessions[2].name,addedAt:at(0)}],toggle:async()=>{}},
 sessions:{lookupByPath:async(path:string)=>sessions.find(s=>s.path===path)}
},events:{subscribe:(name:string,handler:any)=>{listeners.set(name,handler);return()=>listeners.delete(name)}}} as unknown as PsmPluginHostContext
const store=createMeshStore(ctx)
const data={sessions,tags:[],sessionTags:[],getTagsForSession:()=>[],onMoveSession:()=>{},onClearSessionStatus:()=>{},
onSelectSession:()=>{},onOpenPreviewRenameDialog:()=>{},onClearSelectedSession:()=>{},onNewSession:()=>{}} as unknown as AppPluginSurfaceData
document.documentElement.classList.add('theme-light')
const style=document.createElement('style');style.textContent='html,body,#root{margin:0;width:100%;height:100%;overflow:hidden}.ui-check{display:flex;height:100vh;width:100%}.ui-check aside{width:280px;flex-shrink:0;border-right:1px solid rgb(var(--color-border)/.5)}.ui-check main{flex:1;min-width:0}@media(max-width:800px){.ui-check aside{display:none}}';document.head.append(style)
;(window as any).meshUiTest={store,disconnect:()=>listeners.get('psm-mesh:availability')?.({payload:{available:false}})}
createRoot(document.getElementById('root')!).render(<div className="ui-check">
<aside><MeshSidebar ctx={ctx} data={data} active meshStore={store}/></aside>
<main><MeshWorkspace ctx={ctx} data={data} active meshStore={store}/></main>
</div>)
