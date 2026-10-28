export default function PageHeading({
  eyebrow,
  title,
  description,
  align = "left",
  id,
  className = "",
}) {
  return (
    <div className={`section-heading section-heading--${align} ${className}`.trim()}>
      {eyebrow ? (
        <p className="eyebrow">
          <span className="eyebrow-dot" aria-hidden="true" />
          {eyebrow}
        </p>
      ) : null}
      <h2 className="section-title" id={id}>
        {title}
      </h2>
      {description ? <p className="section-description">{description}</p> : null}
    </div>
  );
}
