import { Bot, ChevronDown, EllipsisVertical, ExternalLink, Globe, Lightbulb, ListChecks, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ChecklistEditor, FieldsEditor, PackingBar, HistorySection, LinksSection, SaveStatus, TagEditor, TypePicker } from '../components/editors';
import { AutoText, BrandHeader, BrandPanel, Empty, Section, Sheet, TopBar, TypeIcon } from '../components/ui';
import { typeDef } from '../data/itemTypes';
import type { Item } from '../data/model';
import * as repo from '../data/repo';
import { dayOf, formatDate, formatDateTime } from '../data/util';
import { useData, useToast } from '../ui/context';
import { RestaurantBody } from './RestaurantDetail';
import { tracked, useDraft } from '../ui/draft';
import { afterSheetsClosed, goBack } from '../ui/router';

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

const FIELD_NAMES: Record<string, string> = { type: 'soort', title: 'titel', body: 'notities', tags: 'tags', checklist: 'checklist' };

const ORIGIN_LABEL: Record<string, string> = { sample: 'Voorbeeldgegevens', backup: 'Teruggezet uit back-up', share: 'Gedeeld via Android', 'google-keep': 'Geïmporteerd uit Google Keep', paste: 'Geplakt uit een lijst', claude: 'Gemaakt door Claude uit een aantekening' };

function ItemEditor({ item }: { item: Item }) {
  const toast = useToast();
  const def = typeDef(item.type);
  const compact = def?.compactDetail === true;
  const simple = def?.simpleDetail === true;
  const [picking, setPicking] = useState(false);
  const [menu, setMenu] = useState(false);
  const [title, setTitle, flushTitle] = useDraft(item.title, (v: string) => repo.updateItem(item.id, { title: v.trim() }));
  const [body, setBody, flushBody] = useDraft(item.body, (v: string) => repo.updateItem(item.id, { body: v }));
  const showChecklist = !!def?.checklist || item.checklist.length > 0;
  const [wantChecklist, setWantChecklist] = useState(false);
  const [showFilled, setShowFilled] = useState(false);

  const setType = async (t: Item['type']) => {
    setPicking(false);
    const prev = item.type;
    await tracked(repo.updateItem(item.id, { type: t }));
    toast(t ? `Ingedeeld bij ${typeDef(t)!.plural}` : 'Teruggezet naar Inbox', { action: { label: 'Ongedaan maken', run: () => void repo.updateItem(item.id, { type: prev }) } });
  };

  const remove = async () => {
    setMenu(false);
    await repo.deleteItem(item.id);
    await afterSheetsClosed();
    goBack(item.type ? `/verzameling/${item.type}` : '/inbox');
    toast('Naar prullenbak verplaatst', { action: { label: 'Ongedaan maken', run: () => void repo.restoreItem(item.id) } });
  };

  return (
    <div className="screen detail">
      {simple ? (
        <>
          {/* Paklijst: hoofdscherm met merkkop (D25); naam en voortgang in de kop. */}
          <BrandHeader
            art="packing"
            back="/verzamelingen"
            title={item.title || def?.label || 'Paklijst'}
            sub="Vakantiepaklijst"
            actions={<button type="button" className="icon-btn" aria-label="Meer acties" onClick={() => setMenu(true)}><EllipsisVertical size={22} /></button>}
          />
          <BrandPanel sticky><PackingBar item={item} /></BrandPanel>
        </>
      ) : (
        <TopBar
          back={item.type ? `/verzameling/${item.type}` : '/inbox'}
          title={def?.label ?? 'Inbox'}
          actions={
            <>
              <SaveStatus />
              <button type="button" className="icon-btn" aria-label="Meer acties" onClick={() => setMenu(true)}><EllipsisVertical size={22} /></button>
            </>
          }
        />
      )}

      {item.type === null && (
        <div className="banner banner-suggest">
          <Lightbulb size={20} />
          <span>
            {item.suggestion ? (<>Voorstel: <b>{typeDef(item.suggestion.type)!.label}</b> <small>({item.suggestion.reason}, vaste regel — geen AI)</small></>) : 'Nog niet ingedeeld.'}
          </span>
          <div className="banner-actions">
            {item.suggestion && <button type="button" className="btn btn-primary btn-small" onClick={() => void setType(item.suggestion!.type)}>Indelen</button>}
            <button type="button" className="btn btn-small" onClick={() => setPicking(true)}>{item.suggestion ? 'Andere soort' : 'Kies soort'}</button>
          </div>
        </div>
      )}

      {compact ? (
        <RestaurantBody item={item} title={title} setTitle={setTitle} flushTitle={flushTitle} body={body} setBody={setBody} flushBody={flushBody} onDelete={() => void remove()} />
      ) : (
        <>
        {item.filledBy && (
          <div className="banner banner-claude">
            <Bot size={20} />
            <span>
              Ingevuld door Claude · {formatDate(dayOf(item.filledBy.at))}
              {showFilled && (
                <small className="filled-list">
                  {item.filledBy.fields.filter((k) => !def?.fields.find((f) => f.key === k)?.hidden).map((k) => (FIELD_NAMES[k] ?? def?.fields.find((f) => f.key === k)?.label ?? k).toLowerCase()).join(', ')}. Klopt iets niet? Pas het aan of zet een eerdere versie terug.
                </small>
              )}
            </span>
            <button type="button" className="btn btn-small btn-ghost" aria-expanded={showFilled} onClick={() => setShowFilled(!showFilled)}>{showFilled ? 'Minder' : 'Wat?'}</button>
            <button type="button" className="btn btn-small" onClick={() => void tracked(repo.markChecked(item.id))}>Gecontroleerd</button>
          </div>
        )}

        {!simple && (
          <button type="button" className="type-select" onClick={() => setPicking(true)} aria-label={`Soort: ${def?.label ?? 'Inbox'}. Wijzigen`}>
            <TypeIcon type={item.type} size={18} /> <span>{def?.label ?? 'Inbox'}</span> <ChevronDown size={18} />
          </button>
        )}

        {!simple && (
          <AutoText className="title-input" value={title} onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))} onBlur={flushTitle} placeholder={def?.titlePlaceholder ?? 'Titel'} aria-label={def?.titleLabel ?? 'Titel'} minRows={1} enterKeyHint="done" />
        )}

        {typeof item.fields.summary === 'string' && item.fields.summary.trim() && (
          <div className="summary-box">
            <p>{item.fields.summary}</p>
            <small>{item.filledBy?.fields.includes('summary') || item.origin?.system === 'claude' || item.fields.checkedAt ? 'Door Claude geschreven' : 'Samenvatting'}{item.fields.checkedAt ? ` · ${formatDate(String(item.fields.checkedAt))}` : ''}</small>
          </div>
        )}

        {typeof item.fields.website === 'string' && /^https?:\/\//i.test(item.fields.website) && (
          <a className="btn btn-block website-link" href={item.fields.website} target="_blank" rel="noopener noreferrer">
            <Globe size={18} aria-hidden="true" /> Website <span className="website-host">{hostOf(item.fields.website)}</span> <ExternalLink size={14} aria-hidden="true" />
          </a>
        )}


        <FieldsEditor item={item} />

        {(showChecklist || wantChecklist) && (
          <Section title={simple ? undefined : 'Checklist'}><ChecklistEditor item={item} hideHead={simple} /></Section>
        )}

        <Section title="Mijn notities">
          <AutoText value={body} onChange={(e) => setBody(e.target.value)} onBlur={flushBody} placeholder="Eigen aantekeningen" aria-label="Mijn notities" minRows={3} />
        </Section>

        {!simple && (
          <>
            <Section title="Links en verbanden"><LinksSection kind="item" id={item.id} /></Section>

            <Section title="Tags"><TagEditor item={item} /></Section>

            {!showChecklist && !wantChecklist && (
              <button type="button" className="btn btn-ghost" onClick={() => setWantChecklist(true)}><ListChecks size={18} /> Checklist toevoegen</button>
            )}

            <HistorySection current={item} />
          </>
        )}

        <p className="meta">
          Bewaard {formatDateTime(item.createdAt)} · gewijzigd {formatDateTime(item.updatedAt)}
          {item.origin && <> · {ORIGIN_LABEL[item.origin.system] ?? item.origin.system}</>}
          {item.origin?.system === 'paste' && item.origin.ref && <><br />Oorspronkelijke regel: “{item.origin.ref}”</>}
          {item.origin?.system === 'claude' && item.origin.ref && <><br />Oorspronkelijke aantekening: “{item.origin.ref}”</>}
        </p>
        </>
      )}

      <TypePicker open={picking} value={item.type} onClose={() => setPicking(false)} onPick={(t) => void setType(t)} />
      <Sheet open={menu} onClose={() => setMenu(false)} title="Acties">
        <div className="menu">
          <button type="button" onClick={() => { setMenu(false); setPicking(true); }}><TypeIcon type={item.type} size={18} /> Soort wijzigen</button>
          <button type="button" className="danger" onClick={() => void remove()}><Trash2 size={18} /> Naar prullenbak</button>
        </div>
      </Sheet>
    </div>
  );
}

export function ItemDetail({ id }: { id: string }) {
  const { itemById } = useData();
  const item = itemById.get(id);
  if (!item) return <div className="screen"><TopBar back="/verzamelingen" title="Niet gevonden" /><Empty title="Dit item bestaat niet (meer)." /></div>;
  if (item.deletedAt) {
    return (
      <div className="screen">
        <TopBar back="/prullenbak" title={item.title || 'Item'} />
        <Empty title="Dit item staat in de prullenbak." action={<button type="button" className="btn btn-primary" onClick={() => void repo.restoreItem(id)}>Terugzetten</button>} />
      </div>
    );
  }
  // key: bij wisselen van item verse invoervelden.
  return <ItemEditor key={item.id} item={item} />;
}
