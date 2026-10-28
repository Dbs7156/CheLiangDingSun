export default function AnimatedCardGrid({
  children,
  className = "",
  as: Tag = "div",
  ...rest
}) {
  return (
    <Tag className={`reveal-grid ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}
