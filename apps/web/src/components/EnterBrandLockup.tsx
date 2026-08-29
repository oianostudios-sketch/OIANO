import RingedPlanetGlyph from './RingedPlanetGlyph';
import './EnterBrandLockup.css';

type EnterBrandLockupProps = {
  active?: boolean;
};

/**
 * Canonical large-format OIANO lockup used by the access portal.
 *
 * The master artwork owns the letter composition. Motion is deliberately
 * limited to the solar highlight and the single orbital glyph so later page
 * styles cannot independently resize or reposition individual letters.
 */
export default function EnterBrandLockup({ active = false }: EnterBrandLockupProps) {
  return (
    <div className={`enter-brand-lockup${active ? ' is-active' : ''}`}>
      <img
        src="/brand/oiano-wordmark-master-v7.png"
        alt="OIANO"
        className="enter-brand-lockup__art"
        width="1536"
        height="503"
      />
      <span className="enter-brand-lockup__sun" aria-hidden="true" />
      <span className="enter-brand-lockup__orbit" aria-hidden="true">
        <RingedPlanetGlyph size={220} showPlanet={false} />
      </span>
    </div>
  );
}
