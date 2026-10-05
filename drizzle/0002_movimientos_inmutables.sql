-- El historial de inventario es inmutable: un movimiento no se edita ni se borra; un error se corrige con otro movimiento.
-- Única excepción: la FK created_by ON DELETE SET NULL (si se elimina un usuario, el movimiento queda sin autor).
CREATE OR REPLACE FUNCTION inventory_movements_immutable() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.created_by IS NULL AND to_jsonb(NEW) - 'created_by' = to_jsonb(OLD) - 'created_by' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'inventory_movements es inmutable (%)', TG_OP USING ERRCODE = 'restrict_violation';
END $$;
--> statement-breakpoint
CREATE TRIGGER inventory_movements_immutable
  BEFORE UPDATE OR DELETE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION inventory_movements_immutable();
