import Button from './Button';
import Icon from './Icon';

type ActionItem = { id: string; label: string; icon: Parameters<typeof Icon>[0]['name']; };

type Props = {
  actions: ActionItem[];
  onAction: (id: string) => void;
};

export default function QuickActionsGrid({ actions, onAction }: Props) {
  return (
    <div className="grid grid-2">
      {actions.map((a) => (
        <Button key={a.id} onClick={() => onAction(a.id)}>
          <Icon name={a.icon} />
          {a.label}
        </Button>
      ))}
    </div>
  );
}