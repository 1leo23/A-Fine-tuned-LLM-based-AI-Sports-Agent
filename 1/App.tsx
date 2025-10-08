import React, { useState, useRef, useEffect } from 'react'
import {
  SafeAreaView, View, TextInput, FlatList, Text,
  TouchableOpacity, KeyboardAvoidingView, Platform, StyleSheet,
  StatusBar, Dimensions, ScrollView, Alert
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

const { width } = Dimensions.get('window')

export default function App() {
  // 導航狀態
  const [currentScreen, setCurrentScreen] = useState('chat') // 'chat', 'profile', 'prescription'
  
  // 聊天相關狀態
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '您好，我是您的運動科學助理，有什麼需要幫忙的嗎？' },
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const flatListRef = useRef(null)

  // 個人檔案狀態
  const [profile, setProfile] = useState({
    age: '',
    gender: '男',
    restingHeartRate: '',
    diseases: [],
    hasDisease: false,
    diseaseInput: '',
    exerciseType: '阻力訓練',
    goals: ''
  })

  // 運動處方狀態
  const [prescription, setPrescription] = useState('')
  const [prescriptionLoading, setPrescriptionLoading] = useState(false)

  // 自動滾動到最新訊息
  useEffect(() => {
    if (flatListRef.current && messages.length > 0 && currentScreen === 'chat') {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true })
      }, 100)
    }
  }, [messages, currentScreen])

  // 發送訊息（聊天功能）
  async function sendMessage() {
    if (!input.trim()) return
    const userMsg = { role: 'user', content: input }
    setMessages(prev => [...prev, userMsg])
    setInput("")
    setLoading(true)

    const botMessageIndex = messages.length + 1
    setMessages(prev => [...prev, { role: 'assistant', content: '', isTyping: true }])

    try {
      const res = await fetch("https://9812-34-42-89-126.ngrok-free.app/chat_stream", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "text/plain, text/event-stream"
        },
        body: JSON.stringify({ input })
      })

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }

      if (res.body && res.body.getReader) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let fullResponse = ''
        let isInsideThinkTag = false
        let thinkBuffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          
          for (let i = 0; i < chunk.length; i++) {
            const char = chunk[i]
            
            if (!isInsideThinkTag) {
              const remainingChunk = chunk.slice(i)
              if (remainingChunk.startsWith('<think>')) {
                isInsideThinkTag = true
                thinkBuffer = '<think>'
                i += 6
                continue
              }
              
              fullResponse += char
              
              setMessages(prev => prev.map((msg, index) => 
                index === botMessageIndex ? 
                  { ...msg, content: fullResponse, isTyping: true } : 
                  msg
              ))
            } else {
              thinkBuffer += char
              if (thinkBuffer.endsWith('</think>')) {
                isInsideThinkTag = false
                thinkBuffer = ''
              }
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 50))
        }

        setMessages(prev => prev.map((msg, index) => 
          index === botMessageIndex ? 
            { ...msg, content: fullResponse.trim(), isTyping: false } : 
            msg
        ))

      } else {
        const text = await res.text()
        const cleanedText = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
        
        let currentText = ''
        for (let i = 0; i < cleanedText.length; i++) {
          currentText += cleanedText[i]
          
          setMessages(prev => prev.map((msg, index) => 
            index === botMessageIndex ? 
              { ...msg, content: currentText, isTyping: i < cleanedText.length - 1 } : 
              msg
          ))
          
          await new Promise(resolve => setTimeout(resolve, 30))
        }
      }

    } catch (err) {
      setMessages(prev => {
        const newMessages = [...prev]
        if (newMessages[botMessageIndex]) {
          newMessages[botMessageIndex] = {
            role: 'assistant', 
            content: '❗ 發生錯誤：' + err.message, 
            isTyping: false
          }
        }
        return newMessages
      })
    }

    setLoading(false)
  }

  // 保存個人檔案
  async function saveProfile() {
    if (!profile.age || !profile.restingHeartRate) {
      Alert.alert('提示', '請填寫完整的年齡和安靜心跳率')
      return
    }

    const profilePrompt = `以下是使用者的健康檔案：
年齡：${profile.age} 歲，性別：${profile.gender}，安靜心跳率：${profile.restingHeartRate} 次/分，${profile.hasDisease ? `疾病：${profile.diseaseInput}` : '無疾病'}，
偏好運動：${profile.exerciseType}，運動目標：${profile.goals}。
請記住這些資訊並應用於後續對話中，不用回覆這段。`

    try {
      await fetch("https://9812-34-42-89-126.ngrok-free.app/chat_stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: profilePrompt })
      })
      
      Alert.alert('成功', '個人檔案已保存並同步到助理', [
        { text: '確定', onPress: () => setCurrentScreen('chat') }
      ])
    } catch (err) {
      Alert.alert('錯誤', '保存失敗：' + err.message)
    }
  }

  // 生成運動處方
  async function generatePrescription() {
    if (!profile.age || !profile.restingHeartRate) {
      Alert.alert('提示', '請先完成個人檔案設定')
      return
    }

    setPrescriptionLoading(true)
    setPrescription('')

    const prescriptionPrompt = `請依下列健康數據擬定訓練處方。
年齡：${profile.age} 歲，性別：${profile.gender}，安靜心跳率：${profile.restingHeartRate} 次/分，${profile.hasDisease ? `疾病：${profile.diseaseInput}` : '無疾病'}，運動方式：${profile.exerciseType}，運動目標：${profile.goals}。`

    try {
      const res = await fetch("https://9812-34-42-89-126.ngrok-free.app/chat_stream", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "text/plain, text/event-stream"
        },
        body: JSON.stringify({ input: prescriptionPrompt })
      })

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }

      if (res.body && res.body.getReader) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let fullResponse = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          fullResponse += chunk
          setPrescription(fullResponse.replace(/<think>[\s\S]*?<\/think>/gi, '').trim())
          
          await new Promise(resolve => setTimeout(resolve, 50))
        }
      } else {
        const text = await res.text()
        const cleanedText = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
        setPrescription(cleanedText)
      }

    } catch (err) {
      setPrescription('❗ 生成失敗：' + err.message)
    }

    setPrescriptionLoading(false)
  }

  // 渲染聊天訊息
  const renderMessage = ({ item, index }) => (
    <View style={styles.messageContainer}>
      <View
        style={[
          styles.messageBubble,
          item.role === 'user' ? styles.userBubble : styles.botBubble
        ]}>
        {item.role === 'assistant' && (
          <View style={styles.avatarContainer}>
            <Ionicons name="fitness" size={16} color="#4A90E2" />
          </View>
        )}
        <Text style={[
          styles.messageText,
          item.role === 'user' ? styles.userText : styles.botText
        ]}>
          {item.content}
          {item.isTyping && <Text style={styles.cursor}>|</Text>}
        </Text>
      </View>
    </View>
  )

  // 渲染聊天界面
  const renderChatScreen = () => (
    <>
      <FlatList
        ref={flatListRef}
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContent}
        data={messages}
        keyExtractor={(_, index) => index.toString()}
        renderItem={renderMessage}
        showsVerticalScrollIndicator={false}
      />

      {loading && (
        <View style={styles.loadingContainer}>
          <View style={styles.typingIndicator}>
            <View style={styles.typingDot} />
            <View style={[styles.typingDot, styles.typingDot2]} />
            <View style={[styles.typingDot, styles.typingDot3]} />
          </View>
          <Text style={styles.typingText}>連接中...</Text>
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
        <View style={styles.inputContainer}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="請輸入您的問題..."
              placeholderTextColor="#999"
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={sendMessage}
            />
            <TouchableOpacity 
              onPress={sendMessage} 
              disabled={loading || !input.trim()}
              style={[
                styles.sendButton,
                (loading || !input.trim()) && styles.sendButtonDisabled
              ]}>
              <Ionicons 
                name="send" 
                size={20} 
                color={loading || !input.trim() ? '#999' : '#FFFFFF'} 
              />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </>
  )

  // 渲染個人檔案界面
  const renderProfileScreen = () => (
    <ScrollView style={styles.profileContainer} contentContainerStyle={styles.profileContent}>
      <Text style={styles.sectionTitle}>📋 個人健康檔案</Text>
      
      <View style={styles.formGroup}>
        <Text style={styles.label}>年齡 *</Text>
        <TextInput
          style={styles.textInput}
          value={profile.age}
          onChangeText={(text) => setProfile(prev => ({...prev, age: text}))}
          placeholder="請輸入年齡"
          keyboardType="numeric"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>性別 *</Text>
        <View style={styles.radioGroup}>
          {['男', '女'].map(gender => (
            <TouchableOpacity
              key={gender}
              style={styles.radioItem}
              onPress={() => setProfile(prev => ({...prev, gender}))}>
              <View style={[styles.radio, profile.gender === gender && styles.radioSelected]}>
                {profile.gender === gender && <View style={styles.radioDot} />}
              </View>
              <Text style={styles.radioText}>{gender}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>安靜心跳率 (次/分) *</Text>
        <TextInput
          style={styles.textInput}
          value={profile.restingHeartRate}
          onChangeText={(text) => setProfile(prev => ({...prev, restingHeartRate: text}))}
          placeholder="例如：65"
          keyboardType="numeric"
        />
      </View>

      <View style={styles.formGroup}>
        <TouchableOpacity
          style={styles.checkboxItem}
          onPress={() => setProfile(prev => ({...prev, hasDisease: !prev.hasDisease}))}>
          <View style={[styles.checkbox, profile.hasDisease && styles.checkboxSelected]}>
            {profile.hasDisease && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
          </View>
          <Text style={styles.checkboxText}>有疾病或健康狀況需要注意</Text>
        </TouchableOpacity>
        {profile.hasDisease && (
          <TextInput
            style={[styles.textInput, styles.diseaseInput]}
            value={profile.diseaseInput}
            onChangeText={(text) => setProfile(prev => ({...prev, diseaseInput: text}))}
            placeholder="請描述疾病或健康狀況"
            multiline
          />
        )}
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>偏好運動類型</Text>
        <View style={styles.selectContainer}>
          {['阻力訓練', '有氧運動', '瑜珈', '游泳', '跑步', '健走', '其他'].map(type => (
            <TouchableOpacity
              key={type}
              style={[
                styles.selectItem,
                profile.exerciseType === type && styles.selectItemSelected
              ]}
              onPress={() => setProfile(prev => ({...prev, exerciseType: type}))}>
              <Text style={[
                styles.selectText,
                profile.exerciseType === type && styles.selectTextSelected
              ]}>{type}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>運動目標</Text>
        <TextInput
          style={[styles.textInput, styles.textArea]}
          value={profile.goals}
          onChangeText={(text) => setProfile(prev => ({...prev, goals: text}))}
          placeholder="例如：增強肌力與核心穩定性、減重、提升心肺功能等"
          multiline
          numberOfLines={4}
        />
      </View>

      <TouchableOpacity style={styles.saveButton} onPress={saveProfile}>
        <Ionicons name="save" size={20} color="#FFFFFF" />
        <Text style={styles.saveButtonText}>保存檔案</Text>
      </TouchableOpacity>
    </ScrollView>
  )

  // 渲染運動處方界面
  const renderPrescriptionScreen = () => (
    <ScrollView style={styles.prescriptionContainer} contentContainerStyle={styles.prescriptionContent}>
      <Text style={styles.sectionTitle}>📄 運動處方生成</Text>
      
      <View style={styles.profileSummary}>
        <Text style={styles.summaryTitle}>目前健康資料：</Text>
        <Text style={styles.summaryText}>
          年齡：{profile.age || '未設定'} 歲 | 性別：{profile.gender} | 
          心跳率：{profile.restingHeartRate || '未設定'} 次/分
        </Text>
        <Text style={styles.summaryText}>
          運動類型：{profile.exerciseType} | 目標：{profile.goals || '未設定'}
        </Text>
      </View>

      <View style={styles.buttonGroup}>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => setCurrentScreen('profile')}>
          <Ionicons name="create" size={20} color="#4A90E2" />
          <Text style={styles.editButtonText}>編輯健康資料</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.generateButton, prescriptionLoading && styles.generateButtonDisabled]}
          onPress={generatePrescription}
          disabled={prescriptionLoading}>
          <Ionicons name="document-text" size={20} color="#FFFFFF" />
          <Text style={styles.generateButtonText}>
            {prescriptionLoading ? '生成中...' : '一鍵產生運動處方'}
          </Text>
        </TouchableOpacity>
      </View>

      {prescription && (
        <View style={styles.prescriptionCard}>
          <Text style={styles.prescriptionTitle}>🏃‍♂️ 個人化運動處方</Text>
          <Text style={styles.prescriptionText}>{prescription}</Text>
        </View>
      )}
    </ScrollView>
  )

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <SafeAreaView style={styles.safeArea}>
        
        {/* 標題欄 */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Ionicons name="fitness" size={24} color="#4A90E2" />
            <Text style={styles.headerTitle}>運動科學助理</Text>
          </View>
          <View style={styles.onlineIndicator}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>線上</Text>
          </View>
        </View>

        {/* 導航欄 */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, currentScreen === 'chat' && styles.tabActive]}
            onPress={() => setCurrentScreen('chat')}>
            <Ionicons name="chatbubbles" size={20} color={currentScreen === 'chat' ? '#4A90E2' : '#999'} />
            <Text style={[styles.tabText, currentScreen === 'chat' && styles.tabTextActive]}>聊天</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.tab, currentScreen === 'profile' && styles.tabActive]}
            onPress={() => setCurrentScreen('profile')}>
            <Ionicons name="person" size={20} color={currentScreen === 'profile' ? '#4A90E2' : '#999'} />
            <Text style={[styles.tabText, currentScreen === 'profile' && styles.tabTextActive]}>個人檔案</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.tab, currentScreen === 'prescription' && styles.tabActive]}
            onPress={() => setCurrentScreen('prescription')}>
            <Ionicons name="document-text" size={20} color={currentScreen === 'prescription' ? '#4A90E2' : '#999'} />
            <Text style={[styles.tabText, currentScreen === 'prescription' && styles.tabTextActive]}>運動處方</Text>
          </TouchableOpacity>
        </View>

        {/* 主要內容 */}
        <View style={styles.content}>
          {currentScreen === 'chat' && renderChatScreen()}
          {currentScreen === 'profile' && renderProfileScreen()}
          {currentScreen === 'prescription' && renderPrescriptionScreen()}
        </View>

      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 0 : 25,
  },
  
  // 標題欄樣式
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A202C',
    marginLeft: 8,
  },
  onlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#48BB78',
    marginRight: 6,
  },
  onlineText: {
    fontSize: 12,
    color: '#718096',
  },

  // 導航欄樣式
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#4A90E2',
  },
  tabText: {
    fontSize: 14,
    color: '#999',
    marginLeft: 4,
  },
  tabTextActive: {
    color: '#4A90E2',
    fontWeight: '600',
  },

  // 主要內容區域
  content: {
    flex: 1,
  },

  // 聊天相關樣式
  messagesList: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  messagesContent: {
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  messageContainer: {
    marginVertical: 4,
  },
  messageBubble: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: width * 0.8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  userBubble: {
    backgroundColor: '#4A90E2',
    alignSelf: 'flex-end',
    marginLeft: 60,
  },
  botBubble: {
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
    marginRight: 60,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  avatarContainer: {
    position: 'absolute',
    left: -12,
    top: -8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EBF8FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: '#FFFFFF',
  },
  botText: {
    color: '#2D3748',
  },
  cursor: {
    color: '#4A90E2',
    fontWeight: 'bold',
  },

  // 載入指示器樣式
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CBD5E0',
    marginHorizontal: 2,
  },
  typingDot2: {
    animationDelay: '0.2s',
  },
  typingDot3: {
    animationDelay: '0.4s',
  },
  typingText: {
    fontSize: 14,
    color: '#718096',
    fontStyle: 'italic',
  },

  // 輸入區域樣式
  inputContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 3,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#F7FAFC',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    color: '#2D3748',
    maxHeight: 100,
    paddingVertical: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4A90E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    shadowColor: '#4A90E2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  sendButtonDisabled: {
    backgroundColor: '#E2E8F0',
    shadowOpacity: 0,
    elevation: 0,
  },

  // 個人檔案樣式
  profileContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  profileContent: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A202C',
    marginBottom: 20,
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#2D3748',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  radioGroup: {
    flexDirection: 'row',
  },
  radioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E0',
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    borderColor: '#4A90E2',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4A90E2',
  },
  radioText: {
    fontSize: 16,
    color: '#2D3748',
  },
  checkboxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#CBD5E0',
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#4A90E2',
    borderColor: '#4A90E2',
  },
  checkboxText: {
    fontSize: 16,
    color: '#2D3748',
  },
  diseaseInput: {
    marginTop: 8,
  },
  selectContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  selectItem: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  selectItemSelected: {
    backgroundColor: '#4A90E2',
    borderColor: '#4A90E2',
  },
  selectText: {
    fontSize: 14,
    color: '#2D3748',
  },
  selectTextSelected: {
    color: '#FFFFFF',
  },
  saveButton: {
    backgroundColor: '#4A90E2',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 20,
    shadowColor: '#4A90E2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },

  // 運動處方樣式
  prescriptionContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  prescriptionContent: {
    padding: 20,
  },
  profileSummary: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 14,
    color: '#718096',
    lineHeight: 20,
    marginBottom: 4,
  },
  buttonGroup: {
    marginBottom: 20,
  },
  editButton: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#4A90E2',
  },
  editButtonText: {
    color: '#4A90E2',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  generateButton: {
    backgroundColor: '#4A90E2',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#4A90E2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  generateButtonDisabled: {
    backgroundColor: '#CBD5E0',
    shadowOpacity: 0,
    elevation: 0,
  },
  generateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  prescriptionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  prescriptionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A202C',
    marginBottom: 16,
    textAlign: 'center',
  },
  prescriptionText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#2D3748',
  },
})