"""Generate the ITE 312 Word report from the inspected resort-system source."""
from pathlib import Path
from datetime import date
import json
import math
from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs'
ASSETS = OUT / 'documentation-assets'
ASSETS.mkdir(parents=True, exist_ok=True)
FONT = 'C:/Windows/Fonts/arial.ttf'
BOLD = 'C:/Windows/Fonts/arialbd.ttf'
INK = '#153c48'

def diagram(name, size, boxes, edges, title):
    im = Image.new('RGB', size, 'white')
    dr = ImageDraw.Draw(im)
    dr.text((25, 12), title, fill=INK, font=ImageFont.truetype(BOLD, 25))
    for a, b, label in edges:
        dr.line([a, b], fill='#637d88', width=3)
        angle = math.atan2(b[1]-a[1], b[0]-a[0])
        pts = [b, (b[0]-13*math.cos(angle-.4), b[1]-13*math.sin(angle-.4)),
               (b[0]-13*math.cos(angle+.4), b[1]-13*math.sin(angle+.4))]
        dr.polygon(pts, fill='#637d88')
        if label:
            xy = ((a[0]+b[0])/2, (a[1]+b[1])/2)
            font = ImageFont.truetype(FONT, 17)
            bb = dr.textbbox(xy, label, font=font, anchor='mm')
            dr.rectangle((bb[0]-4, bb[1]-3, bb[2]+4, bb[3]+3), fill='white')
            dr.text(xy, label, fill=INK, font=font, anchor='mm')
    for rect, text, kind in boxes:
        if kind == 'actor':
            x = (rect[0]+rect[2])/2
            y = rect[1]
            dr.ellipse((x-15,y,x+15,y+30), outline=INK, width=3)
            dr.line((x,y+30,x,y+72), fill=INK, width=3)
            dr.line((x-27,y+48,x+27,y+48), fill=INK, width=3)
            dr.line((x,y+72,x-24,y+100), fill=INK, width=3)
            dr.line((x,y+72,x+24,y+100), fill=INK, width=3)
            dr.multiline_text((x,y+117), text, fill=INK, font=ImageFont.truetype(BOLD,19), anchor='mm', align='center')
        else:
            if kind == 'oval':
                dr.ellipse(rect, fill='#edf5f5', outline=INK, width=2)
            else:
                dr.rounded_rectangle(rect, radius=14, fill='#edf5f5', outline=INK, width=2)
            dr.multiline_text(((rect[0]+rect[2])/2,(rect[1]+rect[3])/2),text,fill=INK,font=ImageFont.truetype(FONT,20),anchor='mm',align='center',spacing=7)
    path = ASSETS / name
    im.save(path)
    return path

ipo = diagram('ipo.png',(1400,470),[
    ((30,95,430,405),'INPUT\nGuest and account details\nRoom inventory and rates\nStay dates and guest count\nMessages and payment records','box'),
    ((500,95,900,405),'PROCESS\nValidate identity and permissions\nCheck capacity and availability\nCommit MySQL transactions\nDispatch events and sync requests','box'),
    ((970,95,1370,405),'OUTPUT\nPersistent reservations\nLive messages and scoped updates\nReceipts and operational reports\nLocally queued offline requests','box')
], [((430,250),(500,250),''),((900,250),(970,250),'')], 'Figure 1. Input–Process–Output conceptual framework')

arch = diagram('architecture.png',(1400,820),[
    ((30,100,405,285),'React PWA\nForms, views, Socket.IO client\nJWT in browser localStorage','box'),
    ((30,430,405,620),'Service Worker + IndexedDB\nNetwork-first shell caching\npending and cache stores\nsync-bookings trigger','box'),
    ((535,100,930,285),'Node.js / Express API\nAuthentication and permissions\nValidation and transactions','box'),
    ((535,430,930,620),'Socket.IO server\n/ : guest–receptionist chat\n/admin : scoped employee events','box'),
    ((1060,100,1370,285),'MySQL / InnoDB\nUsers, rooms, bookings\nMessages and payments\nAudit and notifications','box'),
    ((1060,430,1370,620),'Web Push service\nVAPID-authenticated delivery\nBrowser push event\nSystem notification','box')
], [((405,170),(535,170),'REST / JSON'),((930,170),(1060,170),'SQL'),
    ((220,285),(220,430),'cache / queue'),((405,250),(535,450),'Socket.IO'),
    ((735,285),(735,430),'domain changes'),((930,540),(1060,540),'Web Push'),
    ((1215,620),(220,730),'push delivered to service worker'),
    ((220,730),(220,620),'')], 'Figure 2. Implemented system architecture (arrows show principal flows)')

# A sequence diagram uses lifelines rather than representing ordering as a flowchart.
im=Image.new('RGB',(1400,800),'white'); dr=ImageDraw.Draw(im)
dr.text((25,12),'Figure 3. Reservation event propagation and client refresh',fill=INK,font=ImageFont.truetype(BOLD,25))
xs=[150,500,850,1230]
for x,label in zip(xs,['Guest PWA','Express API','MySQL','Employee PWA']):
    dr.rounded_rectangle((x-135,75,x+135,130),10,fill='#edf5f5',outline=INK,width=2)
    dr.text((x,102),label,anchor='mm',fill=INK,font=ImageFont.truetype(BOLD,20))
    dr.line((x,130,x,750),fill='#a0b0b8',width=2)
for y,a,b,label in [(185,0,1,'POST /api/bookings + Bearer JWT'),(255,1,2,'Lock room; check overlap; INSERT; COMMIT'),(325,2,1,'Persisted booking row'),(395,1,3,'admin:change (permitted recipients)'),(465,1,0,'201 Created + booking JSON'),(535,3,1,'GET fresh bookings after invalidation'),(605,1,2,'SELECT authoritative state'),(675,1,3,'200 OK; render updated list')]:
    dr.line((xs[a],y,xs[b],y),fill=INK,width=3)
    sign=1 if b>a else -1
    dr.polygon([(xs[b],y),(xs[b]-sign*12,y-6),(xs[b]-sign*12,y+6)],fill=INK)
    dr.text(((xs[a]+xs[b])/2,y-20),label,anchor='mm',fill=INK,font=ImageFont.truetype(FONT,18))
seq=ASSETS/'sequence.png';im.save(seq)

usecase=diagram('use-cases.png',(1400,1020),[
    ((30,140,200,290),'Guest','actor'),((30,440,200,590),'Receptionist','actor'),
    ((1180,140,1380,290),'Admin /\nSuper Admin','actor'),((1180,650,1380,800),'Operational\nstaff','actor'),
    ((300,95,690,195),'Register / authenticate','oval'),((300,240,690,340),'Search rooms / reserve','oval'),
    ((300,385,690,485),'View / cancel own pending stay','oval'),((300,530,690,630),'Chat / subscribe to push','oval'),
    ((740,95,1130,195),'Manage rooms and reservations','oval'),((740,240,1130,340),'Record / verify payments','oval'),
    ((740,385,1130,485),'Manage staff / view reports','oval'),((740,530,1130,630),'Configure settings (Super Admin)','oval'),
    ((740,675,1130,775),'Room readiness / maintenance','oval'),((300,745,690,845),'Check in / check out guests','oval')
], [((165,190),(300,145),''),((165,205),(300,290),''),((165,220),(300,435),''),((165,235),(300,580),''),
    ((165,500),(300,580),''),((165,515),(300,795),''),((165,485),(740,290),''),
    ((1230,180),(1130,145),''),((1230,200),(1130,290),''),((1230,220),(1130,435),''),((1230,240),(1130,580),''),
    ((1230,720),(1130,725),'')], 'Figure 4. Use cases by actor (permissions further restrict employee actions)')

erd=diagram('erd.png',(1400,1100),[
    ((40,90,420,240),'USERS\nPK id; UNIQUE email\nrole; permission_role','box'),
    ((520,90,900,240),'BOOKINGS\nPK id; FK user_id; FK room_id\nstay dates; status; total_price','box'),
    ((1000,90,1370,240),'ROOMS\nPK id; UNIQUE room_number\nrate; capacity; readiness','box'),
    ((40,390,420,530),'MESSAGES / PUSH_SUBSCRIPTIONS\nPK id; FK sender_id / user_id\ncontent / subscription keys','box'),
    ((520,390,900,530),'PAYMENTS\nPK id; FK booking_id\namount; status; idempotency_key','box'),
    ((1000,390,1370,530),'ROOM_IMAGES\nPK id; FK room_id\nurl','box'),
    ((40,680,420,820),'ADMIN_NOTIFICATIONS\nPK id; FK user_id\nUNIQUE(event_id, user_id)','box'),
    ((520,680,900,820),'PAYMENT_OPERATIONS\nPK id; FK payment_id; actor_id\noperation; amount; request_hash','box'),
    ((1000,680,1370,820),'MAINTENANCE_RECORDS\nPK id; FK room_id; assigned_to\nworkflow_status; priority','box'),
    ((1000,940,1370,1070),'MAINTENANCE_HISTORY\nPK id; FK maintenance_id\nactor_id; action; details','box')
], [((420,165),(520,165),'1 : many'),((1000,165),(900,165),'1 : many'),
    ((230,240),(230,390),'1 : many'),((100,240),(100,680),'1 : many'),
    ((710,240),(710,390),'1 : many'),((710,530),(710,680),'1 : many'),
    ((1185,240),(1185,390),'1 : many'),((1350,240),(1350,680),'1 : many'),
    ((1185,820),(1185,940),'1 : many')], 'Figure 5. Core ERD (selected relationships; supplementary entities in dictionary)')

doc=Document()
sec=doc.sections[0]
sec.top_margin=Inches(.75);sec.bottom_margin=Inches(.7)
sec.left_margin=sec.right_margin=Inches(.7)
style=doc.styles['Normal'];style.font.name='Calibri';style.font.size=Pt(10.5)
style.paragraph_format.space_after=Pt(7)
for n in ['Title','Heading 1','Heading 2','Heading 3']:
    doc.styles[n].font.color.rgb=RGBColor.from_string('153C48')
header=sec.header.paragraphs[0];header.text='ITE 312  |  RESORT RESERVATION AND MANAGEMENT SYSTEM';header.style='Caption'
footer=sec.footer.paragraphs[0];footer.alignment=2
footer.add_run('Project documentation  •  ')
field=OxmlElement('w:fldSimple');field.set(qn('w:instr'),'PAGE');footer._p.append(field)

def p(text,style=None): return doc.add_paragraph(text,style)
def h(text,level=1): return doc.add_heading(text,level)
def bullet(text): return p(text,'List Bullet')
def table(headers,rows):
    t=doc.add_table(rows=1,cols=len(headers));t.style='Light Shading Accent 1'
    for c,v in zip(t.rows[0].cells,headers):c.text=str(v)
    trPr=t.rows[0]._tr.get_or_add_trPr(); repeat=OxmlElement('w:tblHeader');trPr.append(repeat)
    for row in rows:
        for c,v in zip(t.add_row().cells,row):c.text=str(v)
    for row in t.rows:
        row._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
        for cell in row.cells:
            for para in cell.paragraphs:
                for run in para.runs:run.font.size=Pt(8.5)
    p('')
    return t
def image(path,caption,width=6.7):
    doc.add_picture(str(path),width=Inches(width));p(caption,'Caption')
def code(text):
    para=p(text);para.paragraph_format.space_after=Pt(9)
    for run in para.runs:run.font.name='Consolas';run.font.size=Pt(8.5)
def page():doc.add_page_break()

p('ITE 312 – EVENT DRIVEN PROGRAMMING','Subtitle')
doc.add_heading('Resort Reservation and Management System',0)
p('An Event-Driven Progressive Web Application','Subtitle')
p('Final Project Documentation')
p('Prepared by: [Student name(s)]\nCourse / Section: [Course and section]\nSubmitted to: [Instructor name]\nInstitution: [School / university]\nSubmission date: [Date]')
p('Documentation prepared: 17 November 2026\nBasis: Event-Driven-Programming.pdf, Project Documentation Outline (page 2), and the current local source code.')
p('Submission note: Complete the title-page fields and the pending evidence items in Section 4 before final submission. No successful deployment, authenticated workflow, or push delivery is claimed without supporting execution evidence.')
page()
h('Contents')
for text in ['1. Project Overview','1.1 Project Context and Background','1.2 Conceptual Framework','1.3 Project Objectives','1.4 Scope and Delimitation','1.5 Definition of Terms','2. System Architecture and Requirements','2.1 Functional Requirements','2.2 Software and Hardware Requirements','2.3 System Architecture Diagram','2.4 Event-Driven Architecture and Sequence Diagram','2.5 Use Case Diagram','2.6 Database Design and Data Dictionary','3. API and WebSocket Documentation','3.1 REST API Endpoints','3.2 WebSocket Event Payloads','4. User Interface and Testing Summary','4.1 System Screenshots and PWA Walkthrough','4.2 Functional and Edge-Case Testing Checklist','Appendix A. Setup and Demonstration Guide','Appendix B. Source Traceability and Submission Checklist']:
    p(text)
p('Numbering follows the four main sections in the supplied outline. Its API and UI subsections are normalized to 3.x and 4.x for consistency.')
page()
h('1. Project Overview')
h('1.1 Project Context and Background',2)
p('Resort operations require staff to coordinate room inventory, reservations, guest arrivals, payments, and service requests. When these activities are handled through separate records or informal messages, staff may work from different versions of room availability. This can produce overlapping reservations, delayed confirmations, and difficulty reconstructing who changed a record.')
p('The Resort Reservation and Management System brings these activities into a shared web application. Guests search for rooms and submit reservations, receptionists handle daily booking and communication tasks, and administrators oversee inventory, financial verification, accounts, and reports. Operational staff receive narrower access to room readiness and maintenance work.')
p('An event-driven approach supports the speed of these interactions. A persisted booking or payment change can trigger a scoped employee update, while guest–receptionist messages travel through Socket.IO. React updates the affected view without requiring a full-page reload. Persistent database records remain the authoritative source when a client reconnects.')
p('Internet interruptions are another practical concern. The application can retain previously visited production assets and cache selected data, while booking requests that fail without an HTTP response are placed in IndexedDB. On reconnection, an open authenticated page attempts to submit queued requests. A locally queued request is not a confirmed booking: the server still validates the dates, capacity, account, and room availability.')
p('The project therefore combines a React interface, Node.js API, MySQL persistence, WebSocket communication, Web Push integration, and a Service Worker. These mechanisms support the course objectives, while the current limitations in closed-app synchronization, queue retry handling, and runtime evidence must be considered during demonstration and evaluation.')
h('1.2 Conceptual Framework',2)
image(ipo,'Inputs are processed through authorization, validation, database transactions, and asynchronous notification handlers. Outputs feed the next operational interaction.')
h('1.3 Project Objectives',2)
p('General objective: To develop an event-driven, mobile-installable resort management PWA that integrates reservations, daily operations, communication, and persistent records in one system.')
for text in ['Provide role- and permission-based React views for guests, receptionists, administrators, and operational staff.', 'Implement server-authoritative reservations with capacity validation, lifecycle rules, and transaction-based protection against overlapping stays.', 'Deliver bidirectional guest–receptionist messaging and scoped employee refresh events through authenticated Socket.IO connections.', 'Support network-first production asset caching and local offline booking queueing with reconnection-triggered synchronization.', 'Integrate browser push subscriptions and document measurable API, chat, offline, and notification test scenarios.']:bullet(text)
h('1.4 Scope and Delimitation',2)
p('Included scope: guest registration and login; room search and images; reservations and cancellation rules; check-in/out; room readiness and maintenance; manually recorded cash/electronic payments, verification and refunds; staff permissions; guest profiles; reporting and exports; audit trails; employee notification records; shared guest–receptionist chat; and PWA support.')
p('Technical boundaries: accounting currency is PHP; electronic payments are recorded with reference/evidence for manual verification, without an integrated payment gateway. Chat is a shared channel among authorized connected guests and receptionists, rather than private per-booking conversations. Offline support covers selected cached reads and booking submission requests; payments, account administration, and chat are not implemented as reliable offline workflows.')
p('Deployment and validation boundaries: no hosted deployment URL is established in the current evidence. backend/.env is absent and MySQL rejected the automated test connection. Protected screens could not be captured using actual live data. Installability, notification delivery, and background behavior depend on a secure origin, browser support, permission, and configured VAPID keys. The Service Worker is disabled in Vite development mode.')
h('1.5 Definition of Terms',2)
table(['Term','Meaning in this project'],[
('Event-driven architecture','Handlers react to user actions, HTTP responses, socket events, push events, and connectivity changes.'),('PWA','A web application with a manifest and Service Worker that supports app-like installation where the browser permits it.'),('Service Worker','A browser background script handling production fetch caching, push notifications, notification clicks, and sync triggers.'),('IndexedDB','Browser storage used for pending booking requests and selected cached application records.'),('Socket.IO / WebSocket','A bidirectional event transport; Socket.IO may use HTTP polling as a fallback.'),('Web Push / VAPID','Browser notification delivery through push subscriptions and application-server authentication keys.'),('JWT','An eight-hour signed access token; database account state and token version are checked for protected operations.'),('Idempotency key','A unique payment-operation request identifier used to recognize retries and reject conflicting reuse.'),('Transaction / row lock','A database unit of work and locking mechanism that serializes competing changes to shared records.'),('Soft deletion','Archiving or deactivating a record using deleted_at while retaining historical data.'),('Cache invalidation','Marking fetched data as stale so an affected React view requests current server data.'),('Offline queue','Locally saved submission requests awaiting server validation; it does not reserve room inventory.')])
page()
h('2. System Architecture and Requirements')
h('2.1 Functional Requirements',2)
table(['ID / Actor','Required behavior'],[
('FR-01 / Visitor','Register a guest account and authenticate; new registration cannot assign administrator privileges.'),('FR-02 / Guest','Search available rooms by stay dates, view room information, and submit a booking request.'),('FR-03 / Guest','View own bookings and cancel only an own pending booking.'),('FR-04 / Guest','Exchange messages with the authorized receptionist channel and enable supported push notifications.'),('FR-05 / Guest','Store a booking request locally on network failure and attempt submission when an authenticated page reconnects.'),('FR-06 / Receptionist','Review reservations, confirm or cancel them, check guests in/out under lifecycle rules, and use the calendar.'),('FR-07 / Receptionist','Record payments and view permitted guest profiles; payment verification requires a separate permission.'),('FR-08 / Operational staff','View rooms, update authorized readiness states, and handle permitted maintenance tasks.'),('FR-09 / Admin','Manage rooms, bookings, staff accounts, payment verification/refunds, guest records, reports, and audit history.'),('FR-10 / Super Admin','Manage privileged permission assignments and resort settings in addition to administrative functions.'),('FR-11 / System','Persist records in MySQL, calculate booking totals on the server, and reject conflicting concurrent room reservations.'),('FR-12 / System','Publish scoped change events, persist employee inbox records, and issue configured Web Push notifications.')])
p('Employee permissions are read from the database; a role label alone is not sufficient authority. Guest access is limited by ownership rules. Inactive accounts and stale token versions are rejected. Super Admin is a permission profile attached to an account, rather than an additional users.role enum value.')
h('2.2 Software and Hardware Requirements',2)
front=json.loads((ROOT/'frontend/package.json').read_text()); back=json.loads((ROOT/'backend/package.json').read_text())
table(['Component','Declared / observed version','Purpose'],[
('Node.js / npm','Observed v22.23.4 / 10.9.9','Local JavaScript runtime and dependency management'),
*[(k,v,'Frontend dependency' if k not in ['vite','@vitejs/plugin-react','@playwright/test'] else 'Frontend build / verification') for k,v in {**front['dependencies'],**front['devDependencies']}.items()],
*[(k,v,'Backend dependency') for k,v in back['dependencies'].items()],
('MySQL / InnoDB','Server version not verified','Relational persistence and row-level transaction locking'),('Browser','Current standards-capable browser; exact compatibility to be tested','React, IndexedDB, Service Worker, WebSocket, and supported Push APIs'),('Python / python-docx / Pillow','Documentation-generation tooling only','Creates this Word report and embedded diagrams')])
p('Package versions above are package.json ranges, not a claim that every dependency is pinned to that exact version. Lockfiles preserve the repository installation resolution. For a reproducible installation, use npm ci within backend and frontend.')
table(['Environment','Practical baseline (recommended, not benchmarked)'],[('Developer workstation','64-bit Windows, macOS, or Linux; 4 CPU cores; 8 GB RAM; 2 GB available storage plus database/browser requirements.'),('Application host','Node-capable host and MySQL/InnoDB, with persistent storage for uploaded room images and private payment evidence. Size after measuring actual workload.'),('Client device','Laptop or smartphone with a standards-capable browser. Network is required for first load, authentication, live chat, push subscription, and server synchronization.'),('Production network','HTTPS origin; reverse proxy for /api, /uploads, and /socket.io including upgrade support. Push delivery requires outbound Internet access.'),('Local verification','localhost/loopback can provide a secure browser context. A plain HTTP LAN address on a phone generally does not meet secure-context requirements.')])
h('2.3 System Architecture Diagram',2)
image(arch,'The browser accesses the REST API and Socket.IO server. MySQL remains authoritative. Web Push is delivered through the browser push infrastructure to the Service Worker.')
p('The production frontend is built by Vite. Its same-origin /api and /socket.io paths are proxied to the backend during local development/preview; production hosting must provide equivalent routing. Express applies authentication, authorization, validation, and transaction services before returning JSON or file downloads.')
h('2.4 Event-Driven Architecture and Sequence Diagram',2)
image(seq,'A successful reservation commits before the employee change event is published. Refresh requests retrieve authoritative records rather than treating an event as the full database state.')
table(['Trigger','Handler and observable outcome'],[('React form submit','An async API call sends JSON; success updates views, and error responses are displayed.'),('chat:send','The server validates the sender and message, inserts a messages row, and emits chat:receive.'),('Successful room / booking / payment change','The backend publishes a scoped admin:change event; recipient clients invalidate queries and refresh affected views.'),('Socket connection or reconnection','Employee clients invalidate cached admin queries and dispatch resort:data-changed. Periodic/focus refresh provides additional recovery.'),('Network failure creating a booking','The client adds a request to the IndexedDB pending store and attempts to register sync-bookings.'),('online event or flush-bookings message','An open authenticated page calls flushPending and sends pending records to POST /api/bookings.'),('push event','The Service Worker calls showNotification; clicking focuses an existing window or opens the application.')])
p('Offline sequence: open the built application online and authenticate → load room data → lose connectivity → submit a booking → save to IndexedDB → regain connectivity → an open authenticated page submits the queue → the server rechecks availability → accepted requests persist, while HTTP-rejected requests are removed by the current client implementation.')
p('Reliability limits: the worker only messages open clients during sync; it does not hold credentials and submit bookings itself. With no open page, closed-app submission is not implemented. The active flushPending removes a record on any HTTP error, including authentication or server errors. There is no booking idempotency key or conflict-resolution inbox. Chat has automatic transport reconnection, but no explicit replay of messages missed during a disconnect. These are limitations to demonstrate and improve, not guarantees.')
h('2.5 Use Case Diagram',2)
image(usecase,'Actor associations show the main workflow groups. Receptionists record payments; administrators with the relevant permission verify/refund them. Only Super Admin can manage settings.')
h('2.6 Database Design and Data Dictionary',2)
image(erd,'Core relationships use 1-to-many cardinality. Supplementary tables and actor references are summarized below; an entity_id in audit/notification records is polymorphic, not a universal foreign key.')
p('The operational schema is composed of schema.sql plus the additive admin, platform, and advanced migrations. The base schema alone does not describe every current field. Guest profiles are users rows with role=guest; there is no separate guests table. Existing databases must not be reset or reimported for documentation or testing.')
table(['Entity','Key fields / types','Purpose and constraints'],[
('users','id INT PK; name VARCHAR(100); email VARCHAR(150) UNIQUE; password_hash VARCHAR(255); role ENUM; permission_role VARCHAR(30); token_version INT; phone VARCHAR(80)','All actors. Soft-deleted via deleted_at. Permission profile selects database grants.'),
('rooms','id INT PK; room_number VARCHAR(30) UNIQUE NULL; name VARCHAR(100); capacity INT; price_per_night DECIMAL(10,2); status ENUM; amenities TEXT','Inventory and operational readiness: available, occupied, cleaning, maintenance, out_of_service.'),
('bookings','id INT PK; user_id / room_id INT FK; guest_name VARCHAR(120); guests INT; check_in / check_out DATE; total_price DECIMAL(10,2); status ENUM','Stay record with special_requests, check-in/out timestamps and actor IDs. End date is exclusive for stay overlap.'),
('messages','id INT PK; sender_id INT FK; room VARCHAR(100); content TEXT; created_at TIMESTAMP','Persisted shared chat messages; current event flow does not create private rooms.'),
('push_subscriptions','id INT PK; user_id INT FK; endpoint VARCHAR(500) UNIQUE; p256dh / auth VARCHAR(255)','Browser subscription records. Expired endpoints returning 404/410 are removed.'),
('services','id INT PK; name VARCHAR(100); price DECIMAL(10,2); description VARCHAR(255)','Service catalog with soft deletion.'),
('booking_services','id INT PK; booking_id INT FK; service_id INT NULL; name VARCHAR(100); price DECIMAL(10,2); quantity INT; added_by INT FK','Per-booking service snapshots. service_id is not declared a foreign key in the base schema.'),
('payments','id INT PK; booking_id INT FK; amount DECIMAL(10,2); method/status ENUM; recorded_by / verified_by INT FK; evidence_file VARCHAR(255)','Current operational fields include refunded_amount, verified_at, notes, transaction_reference, and unique idempotency_key/request_hash. Evidence is private.'),
('payment_operations','id INT PK; payment_id / actor_id INT FK; operation VARCHAR(30); amount DECIMAL(10,2); reason VARCHAR(1000)','Verification/rejection/refund history with unique idempotency keys and request hashes.'),
('permission_roles','code VARCHAR(30) PK; label VARCHAR(60)','Profile catalog: super_admin, admin, receptionist, housekeeping, operational_staff, guest.'),
('role_permissions','role_code VARCHAR(30) FK; permission VARCHAR(60); composite PK','Many permission grants for each profile. users.permission_role selects a profile logically.'),
('admin_notifications','id BIGINT PK; event_id CHAR(36); user_id INT FK; category VARCHAR(20); entity_id INT NULL; read_at DATETIME','Persistent per-user inbox; UNIQUE(event_id,user_id) prevents duplicate event records.'),
('activity_logs','id BIGINT PK; actor_id INT FK NULL; entity_type VARCHAR(30); entity_id INT; action VARCHAR(60); details TEXT','Read-only application audit history of relevant actions.'),
('room_images','id INT PK; room_id INT FK; url VARCHAR(255)','Multiple photos for one room; rooms.image_url identifies the selected image.'),
('maintenance_records','id INT PK; room_id / assigned_to / created_by INT FK; workflow_status ENUM; priority ENUM; description VARCHAR(1000)','Maintenance assignment and workflow: pending, in_progress, completed, cancelled. Legacy open/resolved status remains compatible.'),
('maintenance_history','id BIGINT PK; maintenance_id / actor_id INT FK; action VARCHAR(40); details TEXT','Chronological maintenance workflow history.'),
('resort_settings','id INT PK; name VARCHAR(150); contact/address VARCHAR(500); policy TEXT; time VARCHAR(5); notification_preferences TEXT','Singleton id=1; configured PHP display, policies, check-in/out times, and notification categories.')])
p('Integrity rules: reservation writes lock the room and check overlapping active stays in a transaction. The overlap predicate is existing.check_in < requested.check_out AND existing.check_out > requested.check_in. Booking total is computed from the current nightly rate and number of nights. Payment allocation uses database locks and idempotency checks; records preserve financial/audit history after archiving. Manila calendar dates are used for operational date rules.')
page()
h('3. API and WebSocket Documentation')
h('3.1 REST API Endpoints',2)
p('Local API base: http://localhost:4000/api. Frontend requests use same-origin /api. Unless public, send Authorization: Bearer <token>. Request bodies are JSON. Typical errors are {"error":"message"}: 400 invalid input, 401 missing/expired/inactive session, 403 permission or ownership restriction, 404 unknown record, 409 business conflict, 429 authentication throttling, and 500 unexpected server failure. Table statuses describe the intended implemented response, not successful execution evidence.')
table(['Method / endpoint','Request body or query','Success / access'],[
('POST /auth/register','{name,email,password}; password ≥12 characters','201 {token,user}; public; always guest'),('POST /auth/login','{email,password}','200 {token,user}; public; invalid credentials 401'),('GET /auth/me','No body','200 public user and permissions; authenticated'),('GET /rooms','No body','200 room array; authenticated read access'),('GET /rooms/available','check_in, check_out; optional guests','200 available room array; authenticated'),('POST /rooms','{name,type,capacity,price_per_night,description,status,amenities,room_number}','201 room; rooms.manage plus legacy role gate'),('PUT /rooms/:id','Editable room fields','200 updated room; rooms.manage'),('DELETE /rooms/:id','No body','200 {ok:true}; archive permission; active stays can cause 409'),('POST /rooms/:id/restore','No body','200 {ok:true}; authorized admin'),('POST /rooms/:id/image','{image: data URL}','200 image information; validated JPG/PNG/WEBP'),('GET /bookings','No body','200 booking array; guest receives own records'),('POST /bookings','{room_id,guest_name,guest_contact,guests,check_in,check_out,special_requests?}','201 persisted booking; 400 invalid stay; 409 conflict'),('PATCH /bookings/:id/status','{status}','200 booking; own pending cancellation for guests; otherwise bookings.manage'),('POST /bookings/:id/check-in','No body','200; confirmed/current stay and room readiness required'),('POST /bookings/:id/check-out','{}','200; settled verified payment balance required; 409 otherwise'),('GET /bookings/:id/bill','No body','200 bill breakdown; authorized employee'),('DELETE /bookings/:id','No body','200; permitted staff/admin archive operation'),('POST /bookings/:id/restore','No body','200; authorized admin'),('GET /messages','No body','200 history with sender names; guest or authorized receptionist'),('GET /push/key','No body','200 {publicKey}; public; empty key if push disabled'),('POST /push/subscribe','{endpoint,keys:{p256dh,auth}}','200 {ok:true}; authenticated'),('GET /ops/dashboard','No body','200 dashboard metrics; dashboard.view'),('GET /ops/calendar','start, end','200 calendar rows; bookings.view'),('GET /ops/bookings/:id','No body','200 booking details; bookings.view'),('PATCH /ops/bookings/:id','Updated room/stay dates, guest count or special requests','200; bookings.manage; availability rechecked'),('POST /ops/payments','{booking_id,amount,method,transaction_reference?,notes?,evidence?}; Idempotency-Key header','201 {id}; retry 200 {id,replayed:true}; payments.record'),('POST /ops/payments/:id/verify','{}; Idempotency-Key header','200; payments.verify'),('POST /ops/payments/:id/reject','{reason}; Idempotency-Key header','200; payments.verify'),('POST /ops/payments/:id/refund','{amount,reason}; Idempotency-Key header','200; payments.refund'),('GET /ops/payments/:id/receipt','No body','200 receipt data; verified funds required'),('GET /ops/staff; POST /ops/staff','GET filters; POST account and permission profile fields','200 list / 201 created; staff.manage'),('GET /admin/notifications','No body; latest 100 records','200 scoped inbox; authenticated employee access'),('PATCH /admin/notifications/read','{id: notificationId} for one; {} for all own records','200; marks own records read'),('GET /advanced/bookings','search,status,start,end,room_id,user_id,page,archived','200 {items,total,page,pages}; bookings.view'),('GET /advanced/guests; GET /advanced/guests/:id','Search/pagination or guest ID','200 list or profile/history; guests.view'),('GET /advanced/payments','search,status,start,end,page','200 paginated payment records; payments.view'),('GET /advanced/payments/:id/receipt.pdf','No body','200 application/pdf; stored verified transaction'),('GET /advanced/maintenance','search,status,priority,page','200 scoped list; maintenance.manage'),('POST /advanced/maintenance','{room_id,description,priority,assigned_to?,mark_unavailable?}','201 created issue; maintenance.manage'),('PATCH /advanced/maintenance/:id','{workflow_status,priority?,assigned_to?,description?,mark_unavailable?}','200 updated issue; assignment/lifecycle enforced'),('GET /advanced/activity','search,start,end,page','200 paginated audit history; activity.view'),('GET /advanced/analytics','preset or start/end','200 selected-range metrics; reports.view'),('GET /advanced/analytics/export','Same range plus format=csv|xlsx|pdf','200 file download; reports.view'),('GET /advanced/policies','No body','200 guest-visible policy/contact subset; authenticated'),('GET /advanced/settings; PUT /advanced/settings','PUT resort/contact/policy/time/currency/preference fields','200; settings.view / settings.manage')])
p('Payment methods are cash, gcash, maya, and bank_transfer. Electronic records require a transaction reference and image evidence. These records support manual verification; the API does not invoke a payment provider to debit or settle funds. Idempotency-Key is required by the operational payment write endpoints, not by booking creation.')
h('Example: authenticate and submit a reservation',3)
code('POST /api/auth/login\nContent-Type: application/json\n\n{"email":"guest@example.com","password":"<actual-password>"}\n\n200 OK\n{"token":"<JWT>","user":{"id":7,"name":"Guest","email":"guest@example.com",\n "role":"guest","permission_role":"guest","permissions":[]}}')
code('POST /api/bookings\nAuthorization: Bearer <JWT>\nContent-Type: application/json\n\n{"room_id":3,"guest_name":"Sample Guest","guest_contact":"09123456789",\n "guests":2,"check_in":"2026-12-01","check_out":"2026-12-03"}')
p('Examples illustrate payload shape only. Use a real available room ID and future dates. The server responds with 201 and the persisted booking row, including its ID, status, and server-calculated total_price; it does not trust a submitted total.')
h('3.2 WebSocket Event Payloads',2)
p('Socket.IO uses the same server origin. Connect with io({auth:{token}}) for chat or io("/admin",{auth:{token}}) for employee updates. The handshake requires a current JWT and active database account. Chat permits guests and receptionists; administrator chat access is rejected. The /admin namespace permits active employees, and event delivery is filtered by current permissions.')
table(['Event / namespace','Direction','Payload / effect'],[('chat:send /','Client → server','String content; trimmed to 1–2000 characters. Server persists before broadcasting.'),('chat:receive /','Server → connected chat clients','{id,content,created_at,sender_id,sender_name}. Current channel is shared.'),('chat:error /','Server → sending client','String validation/delivery error. Current Chat page does not register a dedicated chat:error listener.'),('admin:change /admin','Server → authorized user rooms','{id,category,title,body,entityId}; UUID event ID supports client deduplication.'),('admin:read /admin','Server → own employee sessions','No payload; invalidates the notification query.'),('connect / disconnect / connect_error','Socket lifecycle','Client updates connection state; employee connect triggers fresh queries.'),('resort:data-changed (browser)','Window event, not WebSocket','Optional detail contains the admin change event; view listeners debounce refresh.'),('flush-bookings (Service Worker message)','Worker → open page','{type:"flush-bookings"}; page calls flushPending.')])
code('socket.emit("chat:send", "Is the family room available?");\n\n// Example server event; illustrative values\n{"id":42,"content":"Is the family room available?",\n "created_at":"2026-11-17T08:30:00.000Z","sender_id":7,"sender_name":"Sample Guest"}\n\n// Example employee event\n{"id":"<UUID>","category":"bookings","title":"Booking created",\n "body":"Sample Guest","entityId":18}')
p('Recovery behavior: employee clients reconnect automatically, invalidate queries, and periodically refetch. Notification records persist per user. Chat deduplicates received IDs within the current view, but messages missed during a disconnect are not explicitly fetched on reconnect until history is loaded again. No application-level chat acknowledgement or durable offline outbox is implemented.')
page()
h('4. User Interface and Testing Summary')
h('4.1 System Screenshots and PWA Walkthrough',2)
p('The following images were captured from the actual built frontend using Microsoft Edge in headless mode at 1366×900 and 390×844. They show the unauthenticated interface. These captures demonstrate rendering, not successful database authentication or installation.')
desktop=ASSETS/'login-desktop.png';mobile=ASSETS/'login-mobile.png'
if desktop.exists():image(desktop,'Figure 6. Actual desktop login. The credential form is the entry point to the role-specific application. Capture: local Vite production preview.',6.6)
if mobile.exists():image(mobile,'Figure 7. Actual 390-pixel mobile viewport. The login form adapts to the narrow screen. This is a browser viewport capture, not proof of an installed PWA.',3.1)
table(['Evidence item','Annotation / capture instructions','Current evidence'],[('Desktop and mobile entry view','Identify the credential fields and primary login action.','Actual captures embedded above.'),('Admin dashboard / calendar','After login, label live connection state, metric cards, and a persisted reservation.','Pending database configuration and authenticated capture.'),('Guest and receptionist chat','Show both sessions with the same persisted message and sender/time.','Pending live two-session test; no fabricated screenshot included.'),('Offline booking queue','Show browser offline mode, local queue indicator, and IndexedDB pending record; then the persisted booking after reconnect.','Pending authenticated production-PWA test.'),('Notification alert / inbox','Capture a real OS notification and the intended recipient view; employee inbox and Web Push are separate channels.','Pending VAPID configuration, permission, and delivery test.'),('Installed mobile application','Capture the install prompt or browser installation flow and standalone launch.','Pending supported physical-device / browser installation test.')])
for text in ['Build with npm --prefix frontend run build, then serve the production build using preview for local verification. Vite dev unregisters the worker, so it is unsuitable for proving offline/PWA behavior.', 'Load the production application online, sign in, and visit the required room and booking views so that runtime caching and IndexedDB data have been populated. The worker does not precache an entire asset manifest.', 'On a supported secure origin, use the browser installation controls and launch the installed app. Capture the standalone launch and verify its icon and start URL.', 'Enable notifications from a guest session where the push action is exposed, grant permission, and confirm a saved subscription. Configure valid server VAPID keys before testing delivery.', 'With the authenticated page open, switch offline, submit a booking, and inspect the pending store. Restore connectivity and verify an actual server record, not just disappearance of the banner.', 'Repeat a booking conflict and a closed-app reconnection scenario. Record the current failure behavior and limits rather than describing closed-app delivery as successful.']:p(text,'List Number')
h('4.2 Functional and Edge-Case Testing Checklist',2)
p('Verification status as of 17 November 2026: frontend production build passed after resolving merge-conflict markers in Bookings.jsx; 24 backend/verification JavaScript files passed node --check. The database-dependent regression command failed at MySQL authentication because backend/.env is missing (Access denied for user \'\'@\'localhost\'). The suite did not reach its business assertions. Live chat, offline replay, push delivery, and full API integration therefore remain unverified in this environment.')
table(['Test ID','Scenario','Expected behavior','Actual result','Status'],[
('BLD-01','Build production frontend','Vite produces dist successfully.','Build completed; 516 modules transformed.','Pass'),
('SYN-01','Check backend / test syntax','All inspected .js/.cjs files parse.','24 files passed node --check.','Pass'),
('UI-01','Render desktop / mobile login','Login action is visible at both viewport sizes.','Actual screenshots captured using Edge.','Pass'),
('API-01','Run full regression suite','Connect to isolated MySQL database and execute assertions.','Stopped at MySQL authentication; backend/.env absent.','Blocked'),
('RT-01','Guest sends message to receptionist','Persist once; deliver chat:receive in both authorized sessions.','No authenticated runtime execution.','Not run'),
('RT-02','Disconnect / reconnect chat','Transport reconnects; assess missed-message recovery.','Source shows reconnect but no explicit missed-history replay.','Not run'),
('RT-03','Unauthorized socket connection','Admin chat and invalid-token connections rejected.','Source gates exist; runtime assertion pending.','Not run'),
('OFF-01','Queue booking while offline','Request appears in IndexedDB and is described as pending.','Requires authenticated production session.','Not run'),
('OFF-02','Restore network with open page','Queue is submitted; accepted booking persists on server.','online and worker message handlers present; delivery pending.','Not run'),
('OFF-03','Room taken before replay','Server returns conflict; no overlapping booking inserted.','Current client removes HTTP-rejected queue entry; user recovery is limited.','Not run'),
('OFF-04','Reconnect after closing every app page','Record whether queued submission occurs independently.','Source only messages open clients; autonomous closed-app replay absent.','Known limitation'),
('OFF-05','Replay receives 401 or 500','A resilient queue should retain retryable work or request reauthentication.','Current flushPending deletes on any HTTP response error.','Known limitation'),
('PUSH-01','Background push with permission granted','A real system notification appears for another user’s event.','Keys/subscription/device delivery not configured and tested.','Not run'),
('PUSH-02','Permission denied / missing keys','Clear explanation; no false delivery claim.','Guards present; device behavior pending.','Not run'),
('INT-01','Register → login → reserve → reload','Role, token, and booking persist correctly.','Blocked by backend database configuration.','Not run'),
('INT-02','Two concurrent overlapping reservations','One accepted request and one 409; one persisted booking.','Room locks and overlap checks inspected; runtime pending.','Not run'),
('INT-03','Guest cancels confirmed or another guest’s booking','403; original record remains unchanged.','Ownership/lifecycle checks inspected; runtime pending.','Not run'),
('INT-04','Check out with outstanding balance','409 until sufficient verified payment exists.','Server-side balance enforcement inspected.','Not run'),
('PAY-01','Retry same payment operation','Same idempotency key does not create duplicate payment.','Payment locking and unique keys inspected.','Not run'),
('SEC-01','Stale token / deactivated user','API rejects and sockets cannot retain unauthorized access.','Version/account checks inspected.','Not run'),
('PWA-01','Install and launch on phone','Supported browser installs and opens standalone application.','Manifest exists; physical installation not executed.','Not run')])
p('Pass means the stated check was executed successfully. Blocked means an external configuration prerequisite prevented execution. Not run means there is no measured result. Known limitation is supported by source inspection and is not presented as a passed runtime test. Keep the rubric’s four critical tests—chat, offline/background sync, Web Push, and API integration—open until real evidence is collected.')
h('Test execution procedure',3)
code('npm --prefix frontend run build\nnpm --prefix backend test')
p('The current regression script creates a newly named verification database, starts dedicated API/UI ports, and compares selected existing database records before and after. It requires configured MySQL credentials with suitable privileges and a Playwright browser. Review scripts/verify-advanced.cjs against the current UI before relying on a complete run: it contains an older first-four-navigation assertion and an unscoped Create reservation button lookup that may conflict with the current dashboard-first navigation and duplicate visible actions. Do not change application behavior merely to satisfy stale selectors.')
page()
h('Appendix A. Setup and Demonstration Guide')
h('A.1 Local setup',2)
code('npm --prefix backend ci\nnpm --prefix frontend ci\nCopy-Item backend/.env.example backend/.env')
p('Set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, a strong JWT_SECRET of at least 24 characters, and CLIENT_ORIGIN to the actual frontend origin. Keep .env out of version control. SEED_DEMO should remain false for existing data. For a new empty database only, initialize the base schema; for an existing database, preserve records and apply the additive migration runner.')
code('npm --prefix backend run migrate\nnpm --prefix backend start\n\n# In a separate terminal, for development\nnpm --prefix frontend run dev -- --host 127.0.0.1\n\n# For production-PWA verification instead\nnpm --prefix frontend run build\nnpm --prefix frontend run preview -- --host 127.0.0.1')
p('The default backend listens on port 4000. Set API_PROXY_TARGET when using another API address. Preview’s selected port must also be allowed in CLIENT_ORIGIN when an origin-bearing request requires it. A real deployment must serve HTTPS and proxy the API, uploads, and Socket.IO transport. No cloud deployment was performed as part of this documentation task.')
p('Generate Web Push keys in backend using npx web-push generate-vapid-keys and place VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and a valid VAPID_SUBJECT in the backend environment. Restart the API. The browser normally fetches the public key from /api/push/key. Keep the private key secret.')
p('If privileged setup is required, use backend/bootstrap-super-admin.js with an existing active administrator email as described in the repository deployment guide. Reauthenticate afterward. Do not assume demo accounts are automatically available; seeding is explicit and disabled for production.')
h('A.2 Suggested live demonstration',2)
table(['Step','What to demonstrate','Evidence to retain'],[('1','Introduce guest, receptionist, admin, and operational staff permissions.','Role-specific navigation and rejected unauthorized action.'),('2','Create an available future stay and show it from another permitted session.','Persisted booking ID, server-computed price, live employee refresh.'),('3','Send a guest–receptionist message.','Same message ID and timestamp in both sessions.'),('4','Queue a request offline, restore connection with app open, and show server persistence.','IndexedDB before/after and resulting MySQL/API booking.'),('5','Trigger a configured push notification while recipient page is backgrounded.','Actual browser/OS notification and intended recipient.'),('6','Record, verify, and inspect a payment; enforce checkout balance.','Distinct record/verify permissions and receipt evidence.'),('7','Install and launch the PWA on a supported mobile browser.','Standalone screenshot and installation environment.'),('8','Explain conflicts, token expiry, and closed-app synchronization limits.','Observed result, implementation explanation, and improvement proposal.')])
h('A.3 Defense questions and implementation-based answers',2)
table(['Question','Answer'],[('Why use both REST and Socket.IO?','REST loads and changes authoritative records. Socket.IO carries low-latency events and messages; refresh after a reconnect restores database state.'),('What prevents two users reserving the same room?','The server locks the room in an InnoDB transaction, checks overlapping active stays, and commits one accepted write before competing work proceeds.'),('Does an offline booking reserve inventory immediately?','No. It is a local request; availability is checked only when the server receives it.'),('Will bookings synchronize with every tab closed?','Not with the current implementation. The sync handler asks open pages to submit the queue.'),('Are GCash and Maya integrated payment gateways?','No. The application stores manually submitted references/evidence and uses authorized human verification.'),('Can every user read the same event?','Employee events are permission-scoped; current chat is shared among authorized guests and receptionists.'),('What happens after an HTTP error during queue replay?','The active client removes that queued request. Better retry classification and user-visible recovery remain improvement work.'),('How are successful tests proven?','Use reproducible commands, response/message IDs, stored records, screenshots, and accurate pass/fail results. Source inspection alone does not prove live delivery.')])
page()
h('Appendix B. Source Traceability and Submission Checklist')
table(['Topic','Primary local source'],[('Course requirements','C:/Users/johnf/Downloads/Event-Driven-Programming.pdf, pages 1–2'),('Frontend entry / role navigation','frontend/src/main.jsx; frontend/src/App.jsx'),('Booking interface / API queue','frontend/src/pages/Bookings.jsx; frontend/src/api.js; frontend/src/db.js'),('PWA shell / push / sync','frontend/public/sw.js; frontend/public/manifest.json; frontend/src/push.js'),('Chat','frontend/src/pages/Chat.jsx; backend/server.js'),('Employee event delivery / refresh','backend/lib/realtime.js; frontend/src/admin/data.jsx; frontend/src/features/live.js'),('REST / authentication / authorization','backend/server.js; backend/routes/auth.js; backend/middleware/auth.js; backend/lib/permissions.js'),('Reservation concurrency / lifecycle','backend/lib/booking-service.js; backend/lib/validation.js'),('Financial / staff / operational APIs','backend/routes/operations.js; backend/routes/admin.js; backend/routes/advanced.js'),('Schema and migration definitions','backend/schema.sql; backend/migrate-admin.js; backend/migrate-platform.js; backend/migrate-advanced.js; backend/migrate-all.js'),('Regression and Postman artifacts','scripts/verify-advanced.cjs; postman/admin-smoke.postman_collection.json'),('Setup and operational guidance','docs/advanced-admin.md; docs/platform-upgrade.md; README.md'),('Document generation','scripts/create-project-documentation.py; docs/documentation-assets/')])
p('A legacy frontend/src/offline.js helper also exists, but the inspected active booking queue is frontend/src/api.js plus frontend/src/db.js. This report describes that active path. Package manifests and source files are the evidence for implementation details; no external deployment or external documentation was assumed.')
table(['Required output / criterion','Evidence and remaining work'],[('Complete source repository','Local frontend/backend and migrations are present. Add the final repository URL and revision before submission.'),('Project documentation','This editable Word document follows all requested main sections and includes conceptual, architecture, sequence, use-case, and ER diagrams.'),('Running mobile-installable prototype','Production frontend renders; authenticated database workflows, installation, and hosted/physical-device evidence remain pending.'),('Final presentation / live defense','Use Appendix A demonstration and Q&A; assign presenters and rehearse the four critical tests.'),('System completeness — 30%','Documented workflows exist in source; runtime completion has not been certified.'),('Event-driven / real-time — 30%','Documented Socket.IO and push handlers; obtain measured live chat, reconnection, scoping, and push results.'),('PWA — 20%','Documented caching, local queue, and open-page sync; demonstrate and disclose the closed-app limitation.'),('Full-stack integration — 20%','Build and syntax checks pass; database integration suite currently blocked.'),('Individual defense rubric','Technical mastery 35%; Q&A 25%; live demonstration 25%; communication/professionalism 15%, as supplied in the assignment.')])
p('Before submission: replace title-page placeholders; add repository/deployment URLs; configure the database; run and record the critical tests; capture authenticated screens and real notifications; verify installation on the target device; update the test table with dated actual results; and keep stated limitations aligned with the final code.')

target=OUT/'Resort-System-Project-Documentation.docx'
doc.save(target)
print(target)
print(f'{len(doc.paragraphs)} paragraphs; {len(doc.tables)} tables; {len(doc.inline_shapes)} embedded figures')
