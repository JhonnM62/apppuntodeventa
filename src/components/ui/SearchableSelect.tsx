import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  FlatList,
  StyleSheet,
  Platform,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface SelectOption {
  label: string;
  value: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  price?: number;
  icon?: string;
  isEmpaque?: boolean;
  category?: string;
}

interface SearchableSelectProps {
  label?: string;
  title?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  options: SelectOption[];
  selectedValue: string;
  onSelect: (value: string, option?: SelectOption) => void;
  leadingIcon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  showQuickEmpaquesFilter?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  label,
  title,
  placeholder = '-- Seleccionar --',
  searchPlaceholder = 'Buscar...',
  options,
  selectedValue,
  onSelect,
  leadingIcon,
  disabled = false,
  showQuickEmpaquesFilter = false,
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'TODOS' | 'EMPAQUES'>('TODOS');
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && windowWidth >= 768;

  const selectedOption = useMemo(() => {
    return options.find((opt) => opt.value === selectedValue);
  }, [options, selectedValue]);

  const empaquesCount = useMemo(() => {
    return options.filter((opt) => opt.isEmpaque).length;
  }, [options]);

  const filteredOptions = useMemo(() => {
    let list = options;
    if (showQuickEmpaquesFilter && activeTab === 'EMPAQUES') {
      list = list.filter((opt) => opt.isEmpaque);
    }
    if (!search.trim()) return list;

    const query = search.toLowerCase().trim();
    return list.filter(
      (opt) =>
        opt.label.toLowerCase().includes(query) ||
        (opt.subtitle && opt.subtitle.toLowerCase().includes(query)) ||
        (opt.category && opt.category.toLowerCase().includes(query))
    );
  }, [options, search, activeTab, showQuickEmpaquesFilter]);

  const handleOpen = () => {
    if (disabled) return;
    setSearch('');
    // Si hay empaques sugeridos y estamos en selector de empaque, abrir directamente con el tab de empaques si hay
    if (showQuickEmpaquesFilter && empaquesCount > 0) {
      setActiveTab('EMPAQUES');
    } else {
      setActiveTab('TODOS');
    }
    setModalVisible(true);
  };

  const handleSelect = (option: SelectOption) => {
    onSelect(option.value, option);
    setModalVisible(false);
  };

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}

      {/* Trigger Box */}
      <TouchableOpacity
        style={[
          styles.triggerBox,
          disabled && styles.triggerDisabled,
          modalVisible && styles.triggerActive,
        ]}
        onPress={handleOpen}
        activeOpacity={0.7}
        disabled={disabled}
      >
        <View style={styles.triggerContent}>
          {leadingIcon && (
            <View style={styles.leadingIconBox}>
              <Ionicons name={leadingIcon} size={18} color="#4f46e5" />
            </View>
          )}

          <View style={styles.triggerTextContainer}>
            {selectedOption ? (
              <View>
                <Text style={styles.selectedLabel} numberOfLines={1}>
                  {selectedOption.label}
                </Text>
                {selectedOption.subtitle ? (
                  <Text style={styles.selectedSubtitle} numberOfLines={1}>
                    {selectedOption.subtitle}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text style={styles.placeholderText} numberOfLines={1}>
                {placeholder}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.triggerRight}>
          {selectedOption?.badge ? (
            <View
              style={[
                styles.badgeContainer,
                selectedOption.badgeColor
                  ? { backgroundColor: selectedOption.badgeColor }
                  : undefined,
              ]}
            >
              <Text style={styles.badgeText}>{selectedOption.badge}</Text>
            </View>
          ) : null}

          {selectedOption?.price !== undefined && selectedOption.price > 0 ? (
            <View style={styles.priceBadge}>
              <Text style={styles.priceBadgeText}>
                ${Number(selectedOption.price).toLocaleString('es-CO')}
              </Text>
            </View>
          ) : null}

          <Ionicons
            name="chevron-down"
            size={18}
            color="#64748b"
            style={{ marginLeft: 6 }}
          />
        </View>
      </TouchableOpacity>

      {/* Modal de Selección */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setModalVisible(false)}
        >
          <Pressable
            style={[
              styles.modalCard,
              isDesktop ? styles.modalCardDesktop : styles.modalCardMobile,
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Header del Modal */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.modalTitle}>
                  {title || label || 'Selecciona una opción'}
                </Text>
                <Text style={styles.modalCounter}>
                  {filteredOptions.length} de {options.length} disponibles
                </Text>
              </View>

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setModalVisible(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            {/* Input de Búsqueda */}
            <View style={styles.searchBox}>
              <Ionicons
                name="search"
                size={18}
                color="#64748b"
                style={{ marginRight: 8 }}
              />
              <TextInput
                style={styles.searchInput}
                placeholder={searchPlaceholder}
                placeholderTextColor="#94a3b8"
                value={search}
                onChangeText={setSearch}
                autoFocus={isDesktop}
              />
              {search.length > 0 ? (
                <TouchableOpacity
                  onPress={() => setSearch('')}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="close-circle" size={18} color="#94a3b8" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Filtros Rápidos (si aplica a empaques) */}
            {showQuickEmpaquesFilter && empaquesCount > 0 ? (
              <View style={styles.quickTabsContainer}>
                <TouchableOpacity
                  style={[
                    styles.quickTab,
                    activeTab === 'EMPAQUES' && styles.quickTabActive,
                  ]}
                  onPress={() => setActiveTab('EMPAQUES')}
                >
                  <Ionicons
                    name="cube"
                    size={14}
                    color={activeTab === 'EMPAQUES' ? '#ffffff' : '#d97706'}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.quickTabText,
                      activeTab === 'EMPAQUES' && styles.quickTabTextActive,
                    ]}
                  >
                    Empaques y Desechables ({empaquesCount})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.quickTab,
                    activeTab === 'TODOS' && styles.quickTabActive,
                  ]}
                  onPress={() => setActiveTab('TODOS')}
                >
                  <Text
                    style={[
                      styles.quickTabText,
                      activeTab === 'TODOS' && styles.quickTabTextActive,
                    ]}
                  >
                    Todos los Platos ({options.length})
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Lista de Opciones */}
            <FlatList
              data={filteredOptions}
              keyExtractor={(item) => item.value}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingVertical: 4 }}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="search-outline" size={36} color="#cbd5e1" />
                  <Text style={styles.emptyText}>
                    No se encontraron opciones para "{search}"
                  </Text>
                  {search ? (
                    <TouchableOpacity
                      style={styles.clearSearchBtn}
                      onPress={() => setSearch('')}
                    >
                      <Text style={styles.clearSearchBtnText}>
                        Limpiar búsqueda
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              }
              renderItem={({ item }) => {
                const isSelected = item.value === selectedValue;
                return (
                  <TouchableOpacity
                    style={[
                      styles.optionItem,
                      isSelected && styles.optionItemSelected,
                    ]}
                    onPress={() => handleSelect(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.optionLeft}>
                      {item.isEmpaque ? (
                        <View style={styles.empaqueIconBadge}>
                          <Ionicons name="cube" size={14} color="#b45309" />
                        </View>
                      ) : item.icon ? (
                        <View style={styles.customIconBadge}>
                          <Ionicons name={item.icon as any} size={14} color="#4f46e5" />
                        </View>
                      ) : null}

                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.optionLabel,
                            isSelected && styles.optionLabelSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {item.label}
                        </Text>
                        {item.subtitle ? (
                          <Text style={styles.optionSubtitle} numberOfLines={1}>
                            {item.subtitle}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    <View style={styles.optionRight}>
                      {item.price !== undefined && item.price > 0 ? (
                        <Text style={styles.optionPrice}>
                          ${Number(item.price).toLocaleString('es-CO')}
                        </Text>
                      ) : null}

                      {isSelected ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color="#4f46e5"
                          style={{ marginLeft: 8 }}
                        />
                      ) : (
                        <View style={{ width: 20, marginLeft: 8 }} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  triggerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 46,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'all 0.15s ease-in-out',
      },
    }),
  },
  triggerActive: {
    borderColor: '#4f46e5',
    backgroundColor: '#f8fafc',
  },
  triggerDisabled: {
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
    opacity: 0.7,
  },
  triggerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  leadingIconBox: {
    backgroundColor: '#eef2ff',
    padding: 6,
    borderRadius: 8,
    marginRight: 10,
  },
  triggerTextContainer: {
    flex: 1,
  },
  selectedLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  selectedSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  placeholderText: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '500',
  },
  triggerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeContainer: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  priceBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  priceBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#16a34a',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    width: '100%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 25,
    elevation: 20,
  },
  modalCardDesktop: {
    maxWidth: 520,
    maxHeight: '82%',
  },
  modalCardMobile: {
    maxHeight: '88%',
    marginTop: 'auto',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalCounter: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  closeBtn: {
    backgroundColor: '#f1f5f9',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 8 : 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    padding: 0,
  },
  quickTabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  quickTab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  quickTabActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  quickTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  quickTabTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  optionItemSelected: {
    backgroundColor: '#f5f3ff',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  empaqueIconBadge: {
    backgroundColor: '#fef3c7',
    padding: 6,
    borderRadius: 8,
    marginRight: 10,
  },
  customIconBadge: {
    backgroundColor: '#eef2ff',
    padding: 6,
    borderRadius: 8,
    marginRight: 10,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  optionLabelSelected: {
    color: '#4f46e5',
    fontWeight: '700',
  },
  optionSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  optionRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  emptyContainer: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 8,
  },
  clearSearchBtn: {
    marginTop: 10,
    backgroundColor: '#eef2ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  clearSearchBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4f46e5',
  },
});

export default SearchableSelect;
